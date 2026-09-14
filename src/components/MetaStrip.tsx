import { useI18n } from "../i18n/I18nProvider";
import type { AccountSummary } from "../types/app";
import { remainingPercent } from "../utils/usage";

type MetaStripProps = {
  accounts: AccountSummary[];
  exportingAccounts: boolean;
  onExportAccounts: () => void;
};

export function MetaStrip({ accounts }: MetaStripProps) {
  const { copy } = useI18n();
  const issueCount = accounts.filter((account) => account.authRefreshBlocked || account.profileIntegrityError || account.profileLastValidationError || account.authRefreshError).length;
  const exhaustedCount = accounts.filter((account) => [account.usage?.fiveHour ?? null, account.usage?.oneWeek ?? null].some((usage) => remainingPercent(usage) === 0)).length;
  return (
    <section className="metaStrip" aria-label={copy.metaStrip.ariaLabel}>
      <span>{copy.metaStrip.accountCount} <strong>{accounts.length}</strong></span>
      {exhaustedCount > 0 ? <span className="metaWarning">{copy.accountsGrid.compactExhausted} <strong>{exhaustedCount}</strong></span> : null}
      {issueCount > 0 ? <span className="metaError">{copy.accountsGrid.compactIssues} <strong>{issueCount}</strong></span> : null}
    </section>
  );
}
