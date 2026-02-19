import { useProjectStore } from './store/project-store';
import { Header } from './components/layout/Header';
import { Stepper } from './components/layout/Stepper';
import { UploadStep } from './components/steps/UploadStep';
import { ConfigureStep } from './components/steps/ConfigureStep';
import { ReviewStep } from './components/steps/ReviewStep';
import { DownloadStep } from './components/steps/DownloadStep';
import { TryItOutStep } from './components/playground/TryItOutStep';
import './App.css';

function App() {
  const { currentStep, setStep, files, wsdlDefinitions, generatedFiles } =
    useProjectStore();

  const hasFiles = files.size > 0;
  const hasOperations = wsdlDefinitions.some(w =>
    w.portTypes.some(pt => pt.operations.length > 0),
  );
  const hasGenerated = generatedFiles.length > 0;

  const canAdvance = [hasFiles && hasOperations, true, hasGenerated, true];

  const handleNext = () => {
    if (currentStep < 4) setStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setStep(currentStep - 1);
  };

  const steps = [
    <UploadStep key="upload" />,
    <ConfigureStep key="configure" />,
    <ReviewStep key="review" />,
    <DownloadStep key="download" />,
    <TryItOutStep key="tryitout" />,
  ];

  return (
    <div className="app">
      <Header />

      <details className="about-section" open>
        <summary>What is this?</summary>
        <div className="about-content">
          <p className="about-tagline">
            Turn any SOAP web service into an AI-callable tool — in your browser, in minutes.
          </p>

          <p className="about-desc">
            Enterprises run thousands of SOAP/WSDL services powering critical systems — HR, finance, ERP, supply chain.
            These services work, but they're invisible to modern AI assistants like Claude, Gemini, and ChatGPT.
            <strong> WSDL-to-MCP</strong> bridges that gap by converting SOAP service definitions into
            {' '}<a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">MCP (Model Context Protocol)</a>{' '}
            servers — the open standard for giving AI models access to external tools.
          </p>

          <h4 className="about-heading">How it works</h4>
          <div className="about-steps">
            <div className="about-step">
              <span className="about-step-number">1</span>
              <strong>Upload</strong>
              <span>Drop your .wsdl and .xsd files, or load from a URL</span>
            </div>
            <div className="about-step">
              <span className="about-step-number">2</span>
              <strong>Configure</strong>
              <span>Set endpoint, auth strategy, and naming conventions</span>
            </div>
            <div className="about-step">
              <span className="about-step-number">3</span>
              <strong>Review</strong>
              <span>Inspect all generated TypeScript code before downloading</span>
            </div>
            <div className="about-step">
              <span className="about-step-number">4</span>
              <strong>Download</strong>
              <span>Get a production-ready Node.js MCP server as a .zip</span>
            </div>
            <div className="about-step">
              <span className="about-step-number">5</span>
              <strong>Try It Out</strong>
              <span>Test your tools live with any LLM — right in the browser</span>
            </div>
          </div>

          <h4 className="about-heading">Why use it</h4>
          <div className="about-benefits">
            <div className="about-benefit">
              <strong>No backend needed</strong>
              <span>Everything runs in your browser. Your WSDL files never leave your machine.</span>
            </div>
            <div className="about-benefit">
              <strong>Works with any LLM</strong>
              <span>Claude, Gemini, Ollama, llama.cpp — choose your model in the playground.</span>
            </div>
            <div className="about-benefit">
              <strong>Test before deploying</strong>
              <span>The built-in playground lets you chat with your SOAP tools instantly.</span>
            </div>
            <div className="about-benefit">
              <strong>Production-ready output</strong>
              <span>Generated TypeScript with Zod validation, error handling, and session management.</span>
            </div>
          </div>
        </div>
      </details>

      <Stepper current={currentStep} onStepClick={setStep} canAdvance={canAdvance} />

      <main className="main">
        {steps[currentStep]}
      </main>

      <footer className="nav-footer">
        <button
          className="btn-secondary"
          onClick={handlePrev}
          disabled={currentStep === 0}
        >
          Back
        </button>
        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={currentStep === 4 || (currentStep === 0 && !canAdvance[0])}
        >
          {currentStep === 2 ? 'Generate & Download' : 'Next'}
        </button>
      </footer>
    </div>
  );
}

export default App;
