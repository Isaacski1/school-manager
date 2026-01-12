import React from 'react';
import { motion } from 'framer-motion';

interface VacationOverlayProps {
  reopenDate: string;
}

const VacationOverlay: React.FC<VacationOverlayProps> = ({ reopenDate }) => {
  // Parse date in local timezone to avoid UTC timezone shifts
  const formattedReopenDate = reopenDate ? (() => {
    const [year, month, day] = reopenDate.split('-').map(num => parseInt(num, 10));
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString();
  })() : 'Not set';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-white rounded-lg p-8 m-4 text-center shadow-2xl"
      >
        <h1 className="text-4xl font-bold text-gray-800 mb-4">School is on Vacation!</h1>
        <p className="text-lg text-gray-600 mb-2">
          The school is currently on break. We hope you are having a wonderful time.
        </p>
        <p className="text-lg text-gray-600">
          School will reopen on <span className="font-semibold text-blue-600">{formattedReopenDate}</span>.
        </p>
      </motion.div>
    </motion.div>
  );
};

export default VacationOverlay;
