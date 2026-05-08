import * as React from 'react';
import { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleGlobalRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleGlobalRejection);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    if (this.state.hasError) return;
    this.setState({ hasError: true, error: event.error || new Error(event.message) });
  };

  private handleGlobalRejection = (event: PromiseRejectionEvent) => {
    if (this.state.hasError) return;
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    this.setState({ hasError: true, error });
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Ocorreu um erro inesperado no sistema.';
      let errorDetails = '';

      const rawMessage = this.state.error?.message || '';

      if (rawMessage) {
        if (rawMessage.includes('{"error":')) {
          try {
            const jsonMatch = rawMessage.match(/\{"error":.*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : rawMessage;
            const parsedError = JSON.parse(jsonStr);
            
            if (parsedError.error?.toLowerCase().includes('permissions') || 
                parsedError.error?.toLowerCase().includes('permissão')) {
              errorMessage = 'Acesso Negado: Você não tem as permissões necessárias para realizar esta operação.';
              errorDetails = `Operação: ${parsedError.operationType?.toUpperCase()} | Caminho: ${parsedError.path}`;
            } else {
              errorMessage = parsedError.error || errorMessage;
            }
          } catch (e) {
            if (rawMessage.toLowerCase().includes('permissions') || 
                rawMessage.toLowerCase().includes('permissão')) {
              errorMessage = 'Acesso Negado: Suas permissões atuais não permitem esta ação.';
            } else {
              errorMessage = rawMessage;
            }
          }
        } else if (rawMessage.toLowerCase().includes('permissions') || 
                   rawMessage.toLowerCase().includes('permissão')) {
          errorMessage = 'Acesso Negado: Suas permissões atuais não permitem esta ação.';
        } else {
          errorMessage = rawMessage;
        }
      }

      return (
        <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] max-w-md w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h2 className="text-2xl font-bold text-[#141414] mb-2">Ops! Algo deu errado</h2>
            <p className="text-[#8E9299] mb-6">{errorMessage}</p>
            {errorDetails && (
              <div className="bg-[#F5F5F5] p-3 rounded-xl text-[10px] font-mono text-[#8E9299] mb-6 break-all">
                {errorDetails}
              </div>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#141414] text-white py-3 rounded-xl font-bold hover:scale-105 transition-all"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
