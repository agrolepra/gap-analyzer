import React from 'react';
import styles from './FormField.module.css';

interface FormFieldProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, description, children, htmlFor }) => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
        {description && <span className={styles.description}>{description}</span>}
      </div>
      <div className={styles.control}>
        {children}
      </div>
    </div>
  );
};
