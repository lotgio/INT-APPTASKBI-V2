import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      message: ""
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Errore imprevisto"
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Errore runtime applicazione:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
          <div className="panel" style={{ maxWidth: 720, margin: "24px" }}>
            <h2>Si è verificato un errore</h2>
            <p className="subtitle">{this.state.message}</p>
            <button className="primary" type="button" onClick={() => window.location.reload()}>
              Ricarica pagina
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
