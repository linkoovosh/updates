import React, { ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("MurCHAT Critical Error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-overlay">
          <div className="error-card glass-panel anim-scale-in">
            <div className="error-icon">⚠️</div>
            <h2>Ой! Что-то пошло не так.</h2>
            <p className="error-text">
              Пожалуйста, перезапустите MurCHAT и сообщите в поддержку о вашей проблеме, 
              вам оперативно помогут исправить неисправности.
            </p>
            {this.state.error && (
                <div className="error-code-box">
                    <code>{this.state.error.message}</code>
                </div>
            )}
            <button className="holo-btn primary error-restart-btn" onClick={() => window.location.reload()}>
              Перезапустить MurCHAT
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
