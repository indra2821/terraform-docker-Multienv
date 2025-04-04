import { useSelector } from "react-redux";
import { selectIsDarkMode } from "../Redux/themeSlice";
import edulogo from "../assets/edulogo.svg";

const GetStarted = () => {
  const isDarkMode = useSelector(selectIsDarkMode);

  return (
    <div
      className={`flex flex-col items-center justify-center h-[85vh] py-4 px-2 transition-all duration-300 ${
        isDarkMode ? "bg-darkModeBg text-white" : "bg-lightModeBg text-blue-900"
      }`}
    >
      <div className="max-w-2xl text-center">
        <div className="flex items-center justify-center space-x-2">
          <img src={edulogo} alt="EduMosaic Logo" className="w-16 h-16" />
          <h1 className="text-4xl font-bold">
            <span className="text-primary">Edu</span>
            <span className="text-orange-500">Mosaic</span>
          </h1>
        </div>

        <p className="mt-4 text-lg">
          EduMosaic is an online learning management platform that delivers
          quality and top-notch certified courses to enable fresh graduates to
          have a chance in the labor market and kickstart their career.
        </p>

        <p className="mt-2 text-lg">
          Interested candidates can get certified online by taking part in our
          courses and trainings.
        </p>

        <button className="mt-4 px-6 py-3 rounded-lg shadow-md transition duration-300 bg-orange-500 text-white hover:bg-orange-600 text-lg">
          Get Started
        </button>
      </div>
    </div>
  );
};

export default GetStarted;
