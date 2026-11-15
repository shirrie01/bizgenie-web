import { PANELS, objectiveForGoal, panelIndexOfStage } from "./onboardingPanels";

// Genie v1 (API Issue #154): a deterministic, conversational GUIDE over the accepted six-panel onboarding.
// It is prepared guidance written from the customer's own saved and typed answers. It is NOT a live AI assistant: it calls no model
// and no API, stores nothing and cannot change any answer. Every sentence is chosen from what is actually on screen or saved.

// The API accepts a saved step of 0-20 but the wizard has seven stages (0-6): a step with no panel is still saved progress, never an error.
function savedProgress(onboarding) {
  if (!onboarding || !(onboarding.version > 0)) return { returning: false, label: null };
  const step = onboarding.current_step;
  const index = Number.isInteger(step) && step >= 0 ? panelIndexOfStage(step) : -1;
  return { returning: true, label: index >= 0 ? PANELS[index].label : null };
}

// stageId is the stored stage id (welcome, identity, about, customers, channels, brain, recommendation).
export function genieMessage({ stageId, draft = {}, sector = null, channels = [], onboarding = null, brain = null, brainStatus = "idle", scopeMissing = false }) {
  const name = (brain && brain.name) || String(draft.businessName || "").trim();
  const progress = savedProgress(onboarding);
  const objective = draft.goal ? objectiveForGoal(draft.goal) : null;
  switch (stageId) {
    case "welcome":
      return progress.returning
        ? { say: progress.label
          ? `Welcome back${name ? `, ${name}` : ""}. Your last saved setup was at “${progress.label}”. Carry on from there, or look back at anything you have already answered.`
          : `Welcome back${name ? `, ${name}` : ""}. Your setup progress is saved. Carry on from the beginning, or look back at anything you have already answered.`, ask: null }
        : { say: "Hello, I’m the Genie guide. I’ll walk you through six short panels so BizGenie can plan your first campaign from your own words.", ask: "When you’re ready, press Continue." };
    case "identity":
      return scopeMissing
        ? { say: "Tell me a little about your business: what is it called, and where can people find it online?", ask: "Your business name creates your workspace. A website or profile is optional, and BizGenie does not read it." }
        : { say: `Your workspace${name ? ` for ${name}` : ""} already exists, so there is nothing to create here.`, ask: "Press Continue to describe what the business does." };
    case "about": {
      const inferred = sector && (sector.source === "inferred" || sector.source === "saved_inferred");
      return {
        say: "What do you sell, and who do you want to reach? Write it in your own words.",
        ask: inferred ? `I worked out “${sector.label || sector.key}” from what you wrote. Please confirm it or choose another: I won’t treat it as your answer until you do.` : "Nothing is saved until you press Save progress.",
      };
    }
    case "customers":
      return objective
        ? { say: `You chose “${objective.label}”. I’ll use that to shape your first recommendation, and you can change it at any time.`, ask: "Tell me who your customers are, then press Continue." }
        : { say: "What is the one thing you most want your first campaign to achieve?", ask: "Pick a goal, or write your own. Saving it is your choice." };
    case "brain":
      if (brainStatus === "loading") return { say: "I’m loading your Brand Brain…", ask: null };
      if (brainStatus === "error") return { say: "I couldn’t load your Brand Brain just now, so I won’t show anything as saved.", ask: "You can try loading it again, or skip this panel for now." };
      return brain
        ? { say: `This is what BizGenie has stored about ${name || "your business"}. Facts you wrote are yours; I never confirm anything on your behalf.`, ask: "If something is missing or wrong, use Edit, or skip this panel for now." }
        : { say: "Your Brand Brain becomes available once your workspace has been created.", ask: null };
    case "channels":
      return {
        say: channels.length ? `You’re planning for ${channels.join(", ")}.` : "Where would you like to reach customers? Pick as many as you like.",
        ask: "This is planning only. No account is connected and nothing is posted. You can skip this panel for now.",
      };
    case "recommendation":
      return { say: "That’s everything I need. I can draft a first plan from what you’ve entered.", ask: "You review and change it. Nothing is generated, scheduled or published until you approve it and separately authorise it." };
    default:
      return { say: "", ask: null };
  }
}
