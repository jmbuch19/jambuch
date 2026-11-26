// Fixed rules shared by the flow, the daily job, the terms and the FAQ, so they can never
// disagree. (Prices, sample fees and delivery days are settings: creators.pricing and
// creators.flow.) Changing a value here changes what writers are promised: raise
// TERMS_VERSION when a promise in the terms changes.
export const LIMITS = {
  sampleRefundDays: 3, // sample fee refunded automatically if the sample isn't delivered within
  unfinishedReminderDays: 3, // reminder for an unfinished request (before any payment)
  unfinishedDeleteDays: 14, // an unfinished request and its story are deleted after
  rechecks: 3, // a story can be checked again this many times after a suggested fix
  deleteDaysAfterDelivery: 7, // all files deleted this many days after delivery (brief §6B)
  freeChangePercent: 20, // content changes free up to this share, in one round (brief §6E)
  newOrderPercent: 50, // a change beyond this share of the story is a new order (brief §6E)
  replyWorkingDays: 2, // we reply to writers within
} as const;
