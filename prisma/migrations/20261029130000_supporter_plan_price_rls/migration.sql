-- SupporterPlanPrice (20261029120000_supporter_plan_prices) was written in
-- parallel with 20261029120000_enable_row_level_security and sorts after it,
-- so it needs RLS like every other table (see that migration's header).
ALTER TABLE "SupporterPlanPrice" ENABLE ROW LEVEL SECURITY;
