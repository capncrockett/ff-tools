import React, { useState } from "react";
import "./App.css";
import ColorButton from "./BackgroundChange";

const App: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isGreen, setIsGreen] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const toggleColor = () => {
    setIsGreen(!isGreen);
  };

  return (
    <div className="App">
      {isVisible && <h1>Hello, World!</h1>}
      <button onClick={toggleVisibility}>
        {isVisible ? "Hide Text" : "Show Text"}
      </button>
      <button onClick={toggleColor}>
        {isGreen ? "Change to Blue" : "Change to Green"}
        <ColorButton color={isGreen ? "green" : "blue"} />
      </button>
    </div>
  );
};

export default App;
