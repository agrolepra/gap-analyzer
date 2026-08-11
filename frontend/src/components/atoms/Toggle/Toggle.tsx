import React from 'react';
import styles from './Toggle.module.css';

interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const Toggle: React.FC<ToggleProps> = ({ className = '', ...props }) => {
  return (
    <label className={`${styles.switch} ${className}`}>
      <input type="checkbox" {...props} />
      <span className={styles.slider}></span>
    </label>
  );
};
