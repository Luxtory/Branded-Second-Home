-- migrate:up
-- RLS protects rows; these explicit grants separately protect columns (TECH-052).
-- Delegation RLS already restricts to the current user. No SECURITY DEFINER or broader PII privileges.
GRANT SELECT (id,second_home_id,party_id,role,stake_id,participation_bps,valid_from,valid_until)
  ON app.holding TO authenticated;
CREATE POLICY holding_represented_read ON app.holding FOR SELECT TO authenticated USING (
  valid_from<=now() AND (valid_until IS NULL OR now()<valid_until)
  AND EXISTS (SELECT 1 FROM app.party_delegation d
    WHERE d.party_id=holding.party_id AND d.user_id=auth.uid() AND d.state='active'
      AND d.valid_from<=now() AND (d.valid_until IS NULL OR now()<d.valid_until))
);
GRANT SELECT (id,second_home_id,modality,location,configuration_id,operation_start_date,formalized_at)
  ON app.acquisition TO authenticated;
CREATE POLICY acquisition_holder_read ON app.acquisition FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id=acquisition.second_home_id)
);
GRANT SELECT (id,second_home_id,participation_bps) ON app.stake TO authenticated;
CREATE POLICY stake_holder_read ON app.stake FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.stake_id=stake.id)
);
GRANT SELECT (id,stake_id,exercise_year,bucket,quantity) ON app.use_right_ledger TO authenticated;
CREATE POLICY use_right_holder_read ON app.use_right_ledger FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.stake_id=use_right_ledger.stake_id)
);
GRANT SELECT (id,second_home_id,effective_start_date,operation_start_registered_at)
  ON app.second_home_operation_start TO authenticated;
CREATE POLICY operation_start_holder_read ON app.second_home_operation_start FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id=second_home_operation_start.second_home_id)
);
GRANT SELECT (id,home_edition_id,label,timezone) ON app.second_home TO authenticated;
CREATE POLICY second_home_holder_read ON app.second_home FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id=second_home.id)
);


-- migrate:down
DROP POLICY second_home_holder_read ON app.second_home;
REVOKE SELECT (id,home_edition_id,label,timezone) ON app.second_home FROM authenticated;
DROP POLICY operation_start_holder_read ON app.second_home_operation_start;
DROP POLICY use_right_holder_read ON app.use_right_ledger;
DROP POLICY stake_holder_read ON app.stake;
DROP POLICY acquisition_holder_read ON app.acquisition;
DROP POLICY holding_represented_read ON app.holding;
REVOKE SELECT (id,second_home_id,effective_start_date,operation_start_registered_at)
  ON app.second_home_operation_start FROM authenticated;
REVOKE SELECT (id,stake_id,exercise_year,bucket,quantity) ON app.use_right_ledger FROM authenticated;
REVOKE SELECT (id,second_home_id,participation_bps) ON app.stake FROM authenticated;
REVOKE SELECT (id,second_home_id,modality,location,configuration_id,operation_start_date,formalized_at)
  ON app.acquisition FROM authenticated;
REVOKE SELECT (id,second_home_id,party_id,role,stake_id,participation_bps,valid_from,valid_until)
  ON app.holding FROM authenticated;
