import React from 'react';
import './TermResetEntertainment.css';

const messages = [
  "Calculating term data...",
  "Erasing old records...",
  "Preparing new term setup...",
  "Saving backup...",
  "Resetting configurations...",
  "Almost done...",
];

const TermResetEntertainment: React.FC<{ message?: string }> = ({ message }) => {
  const [messageIndex, setMessageIndex] = React.useState(0);

  React.useEffect(() => {
    if (message) {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [message]);

  const displayMessage = message || messages[messageIndex];

  return (
    <div className="term-reset-entertainment">
      <div className="chalkboard">
        <div className="progress-text">{displayMessage}</div>
      </div>
    </div>
  );
};

export default TermResetEntertainment;