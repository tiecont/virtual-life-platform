import type {ReactNode} from 'react';

/** Shared,source-backed preview disclosure; owner/store review is separate. */
export function AccountDeletionInfo({activeAction,suspendedAction}:{activeAction?:ReactNode;suspendedAction?:ReactNode}){
 return <section aria-labelledby="account-deletion-help"><h2 id="account-deletion-help">Delete your Virtual Life Platform account</h2>
 <p>Deleting an account removes its profile, sign-in details, private settings and associated account data from the live service. Your sessions end. This action cannot be undone.</p>
 <h3>Active accounts, including guests</h3><p>Open your account controls, review the account shown, then explicitly confirm deletion. The service performs the deletion when it accepts your request. Only a confirmed response means deletion is complete.</p>{activeAction}
 <p>If the connection fails, the result may be unconfirmed. Signing out, removing local credentials or uninstalling the app does not prove that the account was deleted. Use the account controls or privacy access below for your next step.</p>
 <h3>Suspended registered accounts</h3><p>You can request deletion through privacy access using your sign-in name and password. A private ownership review and a second password confirmation are required; suspension does not remove this path.</p>{suspendedAction}
 <p>Privacy requests expire after 7 days. An approval is valid for 15 minutes, receipts last 24 hours, and privacy-review security audits are retained for 30 days. These are access and retention windows, not a promised review deadline.</p>
 <h3>Retained records and availability</h3><p>Some security and audit records are unlinked from the deleted account rather than removed immediately. Backups are separate from live data. Deployment-specific backup retention, support contact details and review response times still need confirmation before public distribution.</p>
 <p>Local preview. Public support contact and deployment retention details are not available yet.</p></section>;
}
