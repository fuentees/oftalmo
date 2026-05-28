-- Função de trigger para registrar alterações no histórico de auditoria.
-- O e-mail do usuário é lido das claims JWT do Supabase (disponível em chamadas via PostgREST).
CREATE OR REPLACE FUNCTION log_audit_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_user_email text;
  v_entity_name text;
  v_entity_id text;
BEGIN
  BEGIN
    v_user_email := (current_setting('request.jwt.claims', true)::jsonb)->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_user_email := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id::text;
    v_entity_name := COALESCE(
      (to_jsonb(OLD)->>'title'),
      (to_jsonb(OLD)->>'name'),
      v_entity_id,
      ''
    );
    INSERT INTO audit_logs (user_email, action, entity_type, entity_name, changes)
    VALUES (v_user_email, 'delete', TG_TABLE_NAME, v_entity_name, jsonb_build_object('id', v_entity_id));
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id::text;
    v_entity_name := COALESCE(
      (to_jsonb(NEW)->>'title'),
      (to_jsonb(NEW)->>'name'),
      v_entity_id,
      ''
    );
    INSERT INTO audit_logs (user_email, action, entity_type, entity_name, changes)
    VALUES (v_user_email, 'create', TG_TABLE_NAME, v_entity_name, jsonb_build_object('id', v_entity_id));
  ELSE
    v_entity_id := NEW.id::text;
    v_entity_name := COALESCE(
      (to_jsonb(NEW)->>'title'),
      (to_jsonb(NEW)->>'name'),
      v_entity_id,
      ''
    );
    INSERT INTO audit_logs (user_email, action, entity_type, entity_name, changes)
    VALUES (v_user_email, 'update', TG_TABLE_NAME, v_entity_name, jsonb_build_object('id', v_entity_id));
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger em treinamentos
DROP TRIGGER IF EXISTS audit_trainings ON trainings;
CREATE TRIGGER audit_trainings
AFTER INSERT OR UPDATE OR DELETE ON trainings
FOR EACH ROW EXECUTE FUNCTION log_audit_change();

-- Trigger em profissionais
DROP TRIGGER IF EXISTS audit_professionals ON professionals;
CREATE TRIGGER audit_professionals
AFTER INSERT OR UPDATE OR DELETE ON professionals
FOR EACH ROW EXECUTE FUNCTION log_audit_change();

-- Trigger em inscrições (somente criação e exclusão para evitar spam de updates)
DROP TRIGGER IF EXISTS audit_training_participants ON training_participants;
CREATE TRIGGER audit_training_participants
AFTER INSERT OR DELETE ON training_participants
FOR EACH ROW EXECUTE FUNCTION log_audit_change();
