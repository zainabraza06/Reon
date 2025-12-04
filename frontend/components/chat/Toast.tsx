// components/Toast.tsx
import { useEffect } from 'react';
import { FiCheck, FiX, FiInfo, FiAlertTriangle } from 'react-icons/fi';
import styles from './Toast.module.css';

interface ToastProps {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ 
  type, 
  title, 
  message, 
  duration = 5000, 
  onClose 
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FiCheck className={styles.icon} />;
      case 'error':
        return <FiX className={styles.icon} />;
      case 'warning':
        return <FiAlertTriangle className={styles.icon} />;
      case 'info':
      default:
        return <FiInfo className={styles.icon} />;
    }
  };

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <div className={styles.iconContainer}>
        {getIcon()}
      </div>
      <div className={styles.content}>
        <h4 className={styles.title}>{title}</h4>
        <p className={styles.message}>{message}</p>
      </div>
      <button 
        className={styles.closeButton} 
        onClick={onClose}
        aria-label="Close notification"
      >
        <FiX size={16} />
      </button>
    </div>
  );
};

export default Toast;