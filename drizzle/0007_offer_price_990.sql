UPDATE orders
SET amount_cents = 990, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE payment_status IN ('pending','rejected')
  AND paid_at IS NULL
  AND payment_id IS NULL
  AND amount_cents <> 990;
