const Progress = require("../models/Progress");
const Course = require("../models/Course");
const Content = require("../models/Content");
const Quiz = require("../models/Quiz");
const Enrollment = require("../models/Enrollment");

// Initialize progress when a student enrolls in a course
exports.initializeProgress = async (userId, courseId) => {
  try {
    // Check if progress record already exists
    const existingProgress = await Progress.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (existingProgress) {
      return existingProgress;
    }

    // Get course content and quizzes
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    // Get content items
    const contentItems = await Content.find({ course_id: courseId });

    // Get quizzes
    const quizzes = await Quiz.find({ course_id: courseId });

    // Create empty progress arrays
    const contentProgress = contentItems.map((content) => ({
      content_id: content._id,
      viewed: false,
      percentage_completed: 0,
    }));

    const quizProgress = quizzes.map((quiz) => ({
      quiz_id: quiz._id,
      attempted: false,
      score: 0,
    }));

    // Create new progress record - note that we now use 100% for content weight
    const newProgress = new Progress({
      user_id: userId,
      course_id: courseId,
      content_progress: contentProgress,
      quiz_progress: quizProgress,
      overall_progress: {
        content_weight: 100, // Only count content for progress
        quiz_weight: 0, // Don't factor quiz scores into overall progress
        total_progress: 0,
        last_updated: new Date(),
      },
    });

    await newProgress.save();
    return newProgress;
  } catch (error) {
    console.error("Error initializing progress:", error);
    throw error;
  }
};

// Update content progress
exports.updateContentProgress = async (req, res) => {
  try {
    const { contentId } = req.params;
    const { percentageCompleted, position } = req.body;
    const userId = req.user._id;

    // Validate input
    if (percentageCompleted < 0 || percentageCompleted > 100) {
      return res
        .status(400)
        .json({ message: "Percentage must be between 0 and 100" });
    }

    // Find content to get course ID
    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const courseId = content.course_id;

    // Check if user is enrolled
   const enrollments = await Enrollment.countDocuments({
     course_id: courseId,
   });

    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You must be enrolled in this course" });
    }

    // Get or initialize progress
    let progress = await Progress.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!progress) {
      progress = await this.initializeProgress(userId, courseId);
    }

    // Update content progress
    const contentIndex = progress.content_progress.findIndex(
      (item) => item.content_id.toString() === contentId
    );

    if (contentIndex === -1) {
      // Content not found in progress, add it
      progress.content_progress.push({
        content_id: contentId,
        viewed: true,
        percentage_completed: percentageCompleted,
        last_position: position || 0,
        completed_date: percentageCompleted >= 100 ? new Date() : null,
      });
    } else {
      // Update existing content progress
      const contentProgress = progress.content_progress[contentIndex];
      contentProgress.viewed = true;
      contentProgress.percentage_completed = percentageCompleted;

      if (position !== undefined) {
        contentProgress.last_position = position;
      }

      // Mark as completed if 100% complete
      if (percentageCompleted >= 100 && !contentProgress.completed_date) {
        contentProgress.completed_date = new Date();
      }

      progress.content_progress[contentIndex] = contentProgress;
    }

    // Recalculate overall progress
    await this.recalculateProgress(progress);

    res.status(200).json({
      message: "Progress updated successfully",
      progress: {
        contentProgress: progress.content_progress.find(
          (item) => item.content_id.toString() === contentId
        ),
        overallProgress: progress.overall_progress.total_progress,
      },
    });
  } catch (error) {
    console.error("Error updating content progress:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Mark content as complete (100%)
exports.markContentComplete = async (req, res) => {
  try {
    const { contentId } = req.params;
    const userId = req.user._id;

    // Find content to get course ID
    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const courseId = content.course_id;

    // Check if user is enrolled
    const enrollment = await Enrollment.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You must be enrolled in this course" });
    }

    // Get or initialize progress
    let progress = await Progress.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!progress) {
      progress = await this.initializeProgress(userId, courseId);
    }

    // Update content progress
    const contentIndex = progress.content_progress.findIndex(
      (item) => item.content_id.toString() === contentId
    );

    if (contentIndex === -1) {
      // Content not found in progress, add it as complete
      progress.content_progress.push({
        content_id: contentId,
        viewed: true,
        percentage_completed: 100,
        last_position: 0,
        completed_date: new Date(),
      });
    } else {
      // Update existing content progress to 100%
      progress.content_progress[contentIndex].viewed = true;
      progress.content_progress[contentIndex].percentage_completed = 100;
      progress.content_progress[contentIndex].completed_date = new Date();
    }

    // Recalculate overall progress
    await this.recalculateProgress(progress);

    res.status(200).json({
      message: "Content marked as complete",
      progress: {
        contentProgress: progress.content_progress.find(
          (item) => item.content_id.toString() === contentId
        ),
        overallProgress: progress.overall_progress.total_progress,
      },
    });
  } catch (error) {
    console.error("Error marking content complete:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Update video progress automatically
exports.updateVideoProgress = async (req, res) => {
  try {
    const { contentId } = req.params;
    const { currentTime, duration } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!currentTime || !duration || currentTime < 0 || duration <= 0) {
      return res
        .status(400)
        .json({ message: "Valid currentTime and duration are required" });
    }

    // Calculate percentage
    let percentageCompleted = Math.min(
      Math.round((currentTime / duration) * 100),
      100
    );

    // Find content to get course ID and verify it's a video
    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Verify this is a video content
    if (content.file_type !== "video") {
      return res
        .status(400)
        .json({ message: "This endpoint is only for video content" });
    }

    const courseId = content.course_id;

    // Check if user is enrolled
    const enrollment = await Enrollment.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You must be enrolled in this course" });
    }

    // Get or initialize progress
    let progress = await Progress.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!progress) {
      progress = await this.initializeProgress(userId, courseId);
    }

    // Update content progress
    const contentIndex = progress.content_progress.findIndex(
      (item) => item.content_id.toString() === contentId
    );

    if (contentIndex === -1) {
      // Content not found in progress, add it
      progress.content_progress.push({
        content_id: contentId,
        viewed: true,
        percentage_completed: percentageCompleted,
        last_position: currentTime,
        completed_date: percentageCompleted >= 100 ? new Date() : null,
      });
    } else {
      // Only update if new percentage is higher than existing
      if (
        percentageCompleted >
        progress.content_progress[contentIndex].percentage_completed
      ) {
        progress.content_progress[contentIndex].viewed = true;
        progress.content_progress[contentIndex].percentage_completed =
          percentageCompleted;
        progress.content_progress[contentIndex].last_position = currentTime;

        // Mark as completed if 100% complete
        if (
          percentageCompleted >= 100 &&
          !progress.content_progress[contentIndex].completed_date
        ) {
          progress.content_progress[contentIndex].completed_date = new Date();
        }
      } else {
        // Always update the last position even if percentage doesn't increase
        progress.content_progress[contentIndex].last_position = currentTime;
      }
    }

    // Recalculate overall progress
    await this.recalculateProgress(progress);

    res.status(200).json({
      message: "Video progress updated successfully",
      progress: {
        contentProgress: progress.content_progress.find(
          (item) => item.content_id.toString() === contentId
        ),
        overallProgress: progress.overall_progress.total_progress,
      },
    });
  } catch (error) {
    console.error("Error updating video progress:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Update quiz progress (only for record keeping, doesn't affect overall progress)
exports.updateQuizProgress = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { score } = req.body;
    const userId = req.user._id;

    // Validate input
    if (score < 0 || score > 100) {
      return res
        .status(400)
        .json({ message: "Score must be between 0 and 100" });
    }

    // Find quiz to get course ID
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const courseId = quiz.course_id;

    // Check if user is enrolled
    const enrollment = await Enrollment.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You must be enrolled in this course" });
    }

    // Get or initialize progress
    let progress = await Progress.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!progress) {
      progress = await this.initializeProgress(userId, courseId);
    }

    // Update quiz progress
    const quizIndex = progress.quiz_progress.findIndex(
      (item) => item.quiz_id.toString() === quizId
    );

    if (quizIndex === -1) {
      // Quiz not found in progress, add it
      progress.quiz_progress.push({
        quiz_id: quizId,
        attempted: true,
        score: score,
        completed_date: new Date(),
      });
    } else {
      // Update existing quiz progress
      progress.quiz_progress[quizIndex].attempted = true;
      progress.quiz_progress[quizIndex].score = score;
      progress.quiz_progress[quizIndex].completed_date = new Date();
    }

    // Note: We're NOT recalculating overall progress since quizzes don't count
    // But still save the progress record
    await progress.save();

    res.status(200).json({
      message: "Quiz progress updated successfully",
      progress: {
        quizProgress: progress.quiz_progress.find(
          (item) => item.quiz_id.toString() === quizId
        ),
        // Overall progress is not affected by quiz scores now
        overallProgress: progress.overall_progress.total_progress,
      },
    });
  } catch (error) {
    console.error("Error updating quiz progress:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Get student progress for a course
exports.getProgressByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    // Check if user is enrolled
    const enrollment = await Enrollment.findOne({
      user_id: userId,
      course_id: courseId,
    });

    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You must be enrolled in this course" });
    }

    // Get progress
    let progress = await Progress.findOne({
      user_id: userId,
      course_id: courseId,
    })
      .populate(
        "content_progress.content_id",
        "title description file_type duration"
      )
      .populate("quiz_progress.quiz_id", "title description total_marks");

    if (!progress) {
      // Initialize progress if not found
      progress = await this.initializeProgress(userId, courseId);
      // Re-fetch with populated data
      progress = await Progress.findOne({
        user_id: userId,
        course_id: courseId,
      })
        .populate(
          "content_progress.content_id",
          "title description file_type duration"
        )
        .populate("quiz_progress.quiz_id", "title description total_marks");
    }

    res.status(200).json({
      progress,
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Get all progress for a student (all courses)
exports.getAllProgress = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all progress records for the user
    const progressRecords = await Progress.find({ user_id: userId })
      .populate("course_id", "name instructor")
      .populate("content_progress.content_id", "title file_type")
      .populate("quiz_progress.quiz_id", "title");

    // Get enrollments to include courses without progress
    const enrollments = await Enrollment.find({ user_id: userId }).populate(
      "course_id",
      "name instructor"
    );

    // Create map of courses with progress
    const coursesWithProgress = new Map();
    progressRecords.forEach((record) => {
      coursesWithProgress.set(record.course_id._id.toString(), record);
    });

    // Check for enrollments without progress
    const allProgress = await Promise.all(
      enrollments.map(async (enrollment) => {
        const courseId = enrollment.course_id._id.toString();

        if (!coursesWithProgress.has(courseId)) {
          // Initialize progress for this course
          const newProgress = await this.initializeProgress(userId, courseId);
          return {
            ...newProgress.toObject(),
            course_id: enrollment.course_id,
          };
        }

        return coursesWithProgress.get(courseId);
      })
    );

    res.status(200).json({
      enrolledCourses: allProgress.length,
      progress: allProgress,
    });
  } catch (error) {
    console.error("Error fetching all progress:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Helper method to recalculate overall progress - now only considers content
exports.recalculateProgress = async (progress) => {
  try {
    let totalProgress = 0;

    // Calculate content progress if content exists
    if (progress.content_progress.length > 0) {
      let contentProgressSum = 0;
      let completedContentCount = 0;

      progress.content_progress.forEach((item) => {
        // Ensure percentage_completed is a valid number
        const validPercentage = isNaN(item.percentage_completed)
          ? 0
          : item.percentage_completed;
        contentProgressSum += validPercentage;

        if (validPercentage >= 100) {
          completedContentCount++;
        }
      });

      // Average content progress as percentage (prevent division by zero)
      totalProgress = contentProgressSum / progress.content_progress.length;
    }

    // Ensure totalProgress is a valid number before saving
    progress.overall_progress.total_progress = isNaN(totalProgress)
      ? 0
      : Math.round(totalProgress);
    progress.overall_progress.last_updated = new Date();

    await progress.save();
    return progress;
  } catch (error) {
    console.error("Error recalculating progress:", error);
    throw error;
  }
};


// Get instructor dashboard stats (for instructors only)
exports.getInstructorProgressStats = async (req, res) => {
  try {
    const instructorId = req.user._id;

    // Find all courses by this instructor
    const courses = await Course.find({ instructor: instructorId });

    if (courses.length === 0) {
      return res.status(200).json({
        message: "No courses found for this instructor",
        stats: [],
      });
    }

    const courseIds = courses.map((course) => course._id);

    // Get all progress records for these courses
    const progressStats = await Promise.all(
      courseIds.map(async (courseId) => {
        // Get all enrollments for this course - FIXED LINE
        const enrollments = await Enrollment.countDocuments({
          course_id: courseId,
        });

        // Get progress records for this course
        const progressRecords = await Progress.find({ course_id: courseId });

        // Calculate average progress
        let totalProgress = 0;
        progressRecords.forEach((record) => {
          totalProgress += record.overall_progress.total_progress;
        });

        const avgProgress =
          progressRecords.length > 0
            ? Math.round(totalProgress / progressRecords.length)
            : 0;

        // Get course completion count
        const completedCount = progressRecords.filter(
          (record) => record.overall_progress.total_progress >= 100
        ).length;

        // Get active count (progress between 10-99%)
        const activeCount = progressRecords.filter(
          (record) =>
            record.overall_progress.total_progress >= 10 &&
            record.overall_progress.total_progress < 100
        ).length;

        // Get not started count (progress < 10%)
        const notStartedCount = progressRecords.filter(
          (record) => record.overall_progress.total_progress < 10
        ).length;

        // Get course details
        const course = await Course.findById(courseId);

        return {
          course: {
            _id: courseId,
            name: course.name,
          },
          enrollments,
          avgProgress,
          completedCount,
          activeCount,
          notStartedCount,
          completionRate:
            enrollments > 0 ? (completedCount / enrollments) * 100 : 0,
        };
      })
    );

    res.status(200).json({
      message: "Instructor progress statistics retrieved successfully",
      stats: progressStats,
    });
  } catch (error) {
    console.error("Error getting instructor stats:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
