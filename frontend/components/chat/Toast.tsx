// components/Toast.tsx
import { useEffect } from 'react';
import { FiCheck, FiX, FiInfo, FiAlertTriangle } from 'react-icons/fi';

interface ToastProps {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
  onClose: () => void;
}

const typeStyles: Record<string, string> = {
  success: 'border-emerald-500/40 bg-emerald-500/10',
  error:   'border-red-500/40 bg-red-500/10',
  warning: 'border-yellow-500/40 bg-yellow-500/10',
  info:    'border-blue-500/40 bg-blue-500/10',
};

const iconStyles: Record<string, string> = {
  success: 'text-emerald-400 bg-emerald-500/20',
  error:   'text-red-400 bg-red-500/20',
  warning: 'text-yellow-400 bg-yellow-500/20',
  info:    'text-blue-400 bg-blue-500/20',
};

const Toast: React.FC<ToastProps> = ({ type, title, message, duration = 5000, onClose }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success': return <FiCheck size={16} />;
      case 'error':   return <FiX size={16} />;
      case 'warning': return <FiAlertTriangle size={16} />;
      default:        return <FiInfo size={16} />;
    }
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl min-w-[280px] max-w-[380px] ${typeStyles[type] ?? typeStyles.info}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconStyles[type] ?? iconStyles.info}`}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-white text-sm font-semibold mb-0.5 leading-tight">{title}</h4>
        <p className="text-white/70 text-xs leading-relaxed">{message}</p>
      </div>
      <button
        className="text-white/50 hover:text-white/80 transition-colors cursor-pointer border-0 bg-transparent p-1 rounded shrink-0"
        onClick={onClose}
        aria-label="Close notification"
      >
        <FiX size={16} />
      </button>
    </div>
  );
};

export default Toast;
