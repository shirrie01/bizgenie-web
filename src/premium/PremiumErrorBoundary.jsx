import React from "react";

// A render error inside the Premium Studio must never leave the customer with a blank page and no way forward
// (BG-STUDIO-015-FE). The page shows a calm message and a reload button. It says nothing about what was or was not
// saved, because nothing here knows: the customer is told to check. No error text or stack is shown to the customer.
export default class PremiumErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { if (typeof this.props.onError === "function") this.props.onError(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="ps-banner" role="alert" aria-labelledby="ps-crash-h">
        <h2 id="ps-crash-h">Something went wrong showing this page</h2>
        <p>Your information has not been changed by this error. If you were saving something, reload and check what was saved before trying again.</p>
        <button type="button" className="ps-primary" onClick={() => window.location.reload()}>Reload this page</button>
      </section>
    );
  }
}
