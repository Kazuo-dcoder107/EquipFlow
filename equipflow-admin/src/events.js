// A tiny way for one part of the site to tell another that something changed, without them
// importing each other. The Approvals page announces a decision; the side menu listens and
// refreshes the "waiting" number next to Approvals.
export const APPROVALS_CHANGED = 'equipflow-admin:approvals-changed'

export const announceApprovalsChanged = () => window.dispatchEvent(new Event(APPROVALS_CHANGED))
