// All public copy lives here so it can be reviewed in one place and linted (tests/content.test.js).
// Truthfulness rules (work order BG-WEB-001): nothing is described as operational that is not; no customer numbers, testimonials, conversion figures,
// prices, dates, discounts or guarantees; every capability carries an availability status that is itself honest. NOTHING IS GENERALLY AVAILABLE YET.
export const STATUS = {
  pre: { label: "Pre-release build", note: "Built and being tested. Not yet available to customers." },
  dev: { label: "In development", note: "Not available yet." },
  plan: { label: "Planned", note: "On the roadmap. Not built yet." },
};

export const hero = {
  eyebrow: "Early access · BizGenie is not yet open to the public",
  title: "Your AI Marketing Operating System.",
  lead: "Bring brand intelligence, creative production, campaign planning, publishing workflows and performance learning together in one platform.",
  tagline: "Make. Launch. Learn what converts.",
  ctaPrimary: { label: "Join early access", intent: "early_access" },
  ctaSecondary: { label: "Register as a founding customer", intent: "founding_customer" },
  honesty: "Some parts of BizGenie are built and being tested; others are still in development. This page says which is which.",
};

export const features = [
  { id: "brand-brain", title: "Brand Brain", status: "pre", text: "Set up your business, audience, offer and tone once. The workspace owner approves the facts, and everything created afterwards starts from them." },
  { id: "creative", title: "AI creative drafts", status: "pre", text: "Draft campaign copy from your brand facts and your goal, then review and edit before anything is used. Nothing is published without your approval." },
  { id: "campaigns", title: "Campaign planning and calendar", status: "pre", text: "Turn a goal into a campaign, plan content items and see what is scheduled. You can record when you published a post yourself." },
  { id: "media", title: "Image and video workflows", status: "pre", text: "Request images and video for a campaign item. The price is shown and you confirm it before anything is created. Availability of these will depend on the providers BizGenie is approved to use." },
  { id: "publishing", title: "Publishing workflows", status: "dev", text: "Planning, approval and manual publication records exist in the pre-release build. Automatic publishing to social platforms is in development and depends on each platform approving BizGenie." },
  { id: "learning", title: "Analytics and learning", status: "dev", text: "You can enter results yourself today in the pre-release build. Results measured by the platforms, and suggestions that learn from them, are in development. Suggestions will describe what changed, not what caused it." },
];

export const steps = [
  { title: "Brand setup", text: "Tell BizGenie about your business and approve the facts it may use." },
  { title: "Strategy", text: "Start from the result you want, such as leads, bookings or sales." },
  { title: "Creative", text: "Draft copy, images and video for each campaign item." },
  { title: "Approval", text: "Review every item. Nothing moves on without a person approving it." },
  { title: "Scheduling", text: "Plan when each item should go out." },
  { title: "Measurement", text: "Bring results back in, labelled by where they came from." },
  { title: "Improvement", text: "See what changed between periods and decide what to try next." },
];

export const audiences = [
  { title: "Agencies", text: "Keep several clients' brands apart and consistent, with approval before anything goes out." },
  { title: "Ecommerce", text: "Plan product and promotion content around a sales goal, and keep your offer wording consistent." },
  { title: "Professional services", text: "Explain your expertise clearly and turn it into steady, approved content without overclaiming." },
  { title: "Hospitality", text: "Plan seasonal and event content around bookings, with one place to review it." },
  { title: "Product brands", text: "Launch and sustain a product story across channels from one brand source." },
];

export const previews = [
  { id: "overview", file: "previews/overview.jpg", w: 1440, h: 900, alt: "A BizGenie workspace overview for a sample fragrance business, showing its profile status, recommended next steps and what BizGenie knows about the business.", caption: "Workspace overview" },
  { id: "growth", file: "previews/growth.jpg", w: 1440, h: 900, alt: "The BizGenie Growth centre for a sample business: objective, current performance, content pipeline and experiments, shown with empty states because nothing has been created or measured yet.", caption: "Growth centre" },
  { id: "calendar", file: "previews/calendar.jpg", w: 1440, h: 900, alt: "The BizGenie campaign calendar for a sample business, with nothing scheduled yet.", caption: "Campaign calendar" },
];
export const previewNote = "Screenshots of the pre-release product with made-up sample businesses and no real customer data. Features and appearance may change before release.";

export const founding = {
  title: "Founding customers",
  text: "If your business would like early access and may become a paying subscriber when BizGenie is ready, register your interest. Founding-customer registrations are looked at first when invitations are decided.",
  terms: [
    "Registering does not guarantee that you will be invited.",
    "There is no launch date to promise yet.",
    "No price, discount or special offer has been set or is offered here.",
    "You are not asked to pay anything now.",
  ],
};

export const faq = [
  { q: "Is BizGenie available now?", a: "No. BizGenie is not yet open to the public. Some parts are built and being tested; others are in development. Registering your interest is the way to hear when access opens." },
  { q: "Which social channels will be supported?", a: "Planning and manual publication records come first. Automatic publishing is in development and starts only for platforms that have approved BizGenie. We will not list a channel as supported until it is. Instagram and Facebook are being worked on first; others may follow." },
  { q: "What happens to the details I give you?", a: "We use them to respond to your registration and, only if you tick the separate box, to send product news. We do not ask for social media passwords or tokens. The privacy notice explains what we collect, why, and your rights." },
  { q: "What is the difference between early access and founding customer?", a: "Early access is for anyone who wants updates and an invitation when it is available. Founding customer is for businesses that would like early access and may become paying subscribers when the product is ready. Neither promises a place, a date, or a price." },
  { q: "How do invitations work?", a: "We expect to invite businesses in small groups so we can support them properly. Founding-customer registrations are looked at first, but registering does not guarantee an invitation. We will email you if you are invited." },
  { q: "Will you share my details?", a: "We will not sell them. The privacy notice lists who processes them for us once that is confirmed." },
  { q: "How do I ask to have my details deleted?", a: "Use the contact details on the data-deletion page. We will confirm what we hold and remove it unless the law requires us to keep it." },
];

export const industries = [
  ["", "Choose your industry"], ["agency", "Agency"], ["ecommerce", "Ecommerce or online retail"], ["professional_services", "Professional services"],
  ["hospitality", "Hospitality"], ["product_brand", "Product brand"], ["other", "Other"],
];
export const priorities = [
  ["brand_consistency", "Keeping my brand consistent"], ["faster_content", "Creating content faster"], ["campaign_planning", "Planning campaigns"],
  ["publishing", "Scheduling and publishing"], ["performance", "Understanding what works"], ["image_video", "Images and video"],
];
export const intentions = [
  { value: "early_access", label: "Early access", help: "Updates, and an invitation when access opens." },
  { value: "founding_customer", label: "Founding customer", help: "Early access for a business that may become a paying subscriber when the product is ready." },
];

// Consent wording is versioned. The server records the version and the wording hash it was shown; changing a word means a new version.
export const CONSENT_VERSION = "early-access-contact-v1";
export const CONSENT_CONTACT = "I agree that BizGenie may use these details to contact me about early access to BizGenie.";
export const CONSENT_MARKETING = "I would also like occasional news about BizGenie. I can unsubscribe at any time. (Optional)";
