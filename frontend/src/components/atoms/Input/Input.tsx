import React from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  multiline?: boolean;
}

export const Input: React.FC<InputProps> = ({ multiline, className = '', ...props }) => {
  if (multiline) {
    return (
      <textarea 
        className={`${styles.input} ${styles.textarea} ${className}`} 
        {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    );
  }
  
  return (
    <input 
      className={`${styles.input} ${className}`} 
      {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
    />
  );
};
