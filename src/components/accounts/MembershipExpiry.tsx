import type { AccountSummary } from "../../types/app";
import { formatFullDate } from "../../utils/dateFormatting";

type MembershipExpiryProps = {
  account: AccountSummary;
  locale: string;
  authBusy: boolean;
  reauthorizeLabel: string;
  onReauthorize: (account: AccountSummary) => void;
};

const MEMBERSHIP_COPY = {
  "zh-CN": {
    label: "会员到期时间（仅供参考）",
    help: "该时间来自登录令牌，可能缺失或延迟更新；若显示为空，可尝试重新登录。",
    unavailable: "未提供",
  },
  en: {
    label: "Membership expiry (for reference only)",
    help: "This date comes from the sign-in token and may be unavailable or delayed. If it is empty, try signing in again.",
    unavailable: "Not provided",
  },
};

export function MembershipExpiry({
  account,
  locale,
  authBusy,
  reauthorizeLabel,
  onReauthorize,
}: MembershipExpiryProps) {
  const text = locale === "zh-CN" ? MEMBERSHIP_COPY["zh-CN"] : MEMBERSHIP_COPY.en;
  const helpId = `membership-help-${account.id}`;

  return (
    <div className="membershipExpiryMeta">
      <span className="membershipExpiryLabel">
        {text.label}
        <span className="membershipHelpTip">
          <button
            type="button"
            className="membershipHelpButton"
            aria-label={text.help}
            aria-describedby={helpId}
          >
            i
          </button>
          <span id={helpId} className="membershipHelpBubble" role="tooltip">
            {text.help}
          </span>
        </span>
      </span>
      <strong>{formatFullDate(account.subscriptionActiveUntil, locale, text.unavailable)}</strong>
      {!account.subscriptionActiveUntil ? (
        <button
          type="button"
          className="membershipReauthorizeAction"
          onClick={() => onReauthorize(account)}
          disabled={authBusy}
        >
          {reauthorizeLabel}
        </button>
      ) : null}
    </div>
  );
}
