import { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Toast, ToastType, toastService } from '../services/toastService';

function getToastIcon(type: ToastType) {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'info':
      return <Info className="h-5 w-5 text-blue-500" />;
    default:
      return <Info className="h-5 w-5 text-gray-500" />;
  }
}

function getToastColors(type: ToastType) {
  switch (type) {
    case 'success':
      return 'bg-green-50 border-green-200 text-green-800';
    case 'error':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'warning':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    case 'info':
      return 'bg-blue-50 border-blue-200 text-blue-800';
    default:
      return 'bg-gray-50 border-gray-200 text-gray-800';
  }
}

function ToastItem({ toast }: { toast: Toast }) {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => toastService.remove(toast.id), 300);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`flex items-center p-4 mb-3 border rounded-lg shadow-sm transition-all duration-300 ${getToastColors(
        toast.type
      )}`}
    >
      <div className="flex-shrink-0">
        {getToastIcon(toast.type)}
      </div>
      <div className="flex-1 ml-3">
        <p className="text-sm font-medium">{toast.message}</p>
      </div>
      <button
        onClick={handleClose}
        className="flex-shrink-0 ml-3 p-1 hover:bg-black hover:bg-opacity-10 rounded-full transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Subscribe to new toasts
    const unsubscribeAdd = toastService.subscribe((newToast) => {
      setToasts(prev => [...prev, newToast]);
    });

    // Subscribe to toast removal
    const unsubscribeRemove = toastService.subscribeToRemoval((removedId) => {
      setToasts(prev => prev.filter(toast => toast.id !== removedId));
    });

    return () => {
      unsubscribeAdd();
      unsubscribeRemove();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-96 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
