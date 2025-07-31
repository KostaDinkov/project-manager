export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

class ToastService {
  private listeners: ((toast: Toast) => void)[] = [];
  private removeListeners: ((id: string) => void)[] = [];
  private toasts: Toast[] = [];
  private idCounter = 0;

  subscribe(listener: (toast: Toast) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  subscribeToRemoval(listener: (id: string) => void) {
    this.removeListeners.push(listener);
    return () => {
      this.removeListeners = this.removeListeners.filter(l => l !== listener);
    };
  }

  private generateId(): string {
    return `toast-${Date.now()}-${++this.idCounter}`;
  }

  private notify(toast: Toast) {
    this.toasts.push(toast);
    this.listeners.forEach(listener => listener(toast));
    
    // Auto-remove toast after duration
    setTimeout(() => {
      this.remove(toast.id);
    }, toast.duration || 5000);
  }

  success(message: string, duration?: number) {
    this.notify({
      id: this.generateId(),
      message,
      type: 'success',
      duration
    });
  }

  error(message: string, duration?: number) {
    this.notify({
      id: this.generateId(),
      message,
      type: 'error',
      duration: duration || 8000 // Errors stay longer
    });
  }

  warning(message: string, duration?: number) {
    this.notify({
      id: this.generateId(),
      message,
      type: 'warning',
      duration
    });
  }

  info(message: string, duration?: number) {
    this.notify({
      id: this.generateId(),
      message,
      type: 'info',
      duration
    });
  }

  remove(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.removeListeners.forEach(listener => listener(id));
  }

  getToasts() {
    return this.toasts;
  }
}

export const toastService = new ToastService();
