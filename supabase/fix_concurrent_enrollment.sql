-- Trigger 1: verifica limite de vagas de forma atômica antes de cada INSERT
-- O FOR UPDATE trava a linha do treinamento e serializa inscrições simultâneas,
-- evitando que duas pessoas passem na verificação ao mesmo tempo quando resta 1 vaga.
CREATE OR REPLACE FUNCTION enforce_training_capacity()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
BEGIN
  -- Cancelamentos não consomem vaga
  IF NEW.enrollment_status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Trava a linha do treinamento para serializar verificações simultâneas
  SELECT max_participants INTO v_max
  FROM trainings
  WHERE id = NEW.training_id
  FOR UPDATE;

  -- Sem limite definido: libera
  IF v_max IS NULL OR v_max <= 0 THEN
    RETURN NEW;
  END IF;

  -- Conta inscritos ativos (excluindo cancelados)
  SELECT COUNT(*) INTO v_current
  FROM training_participants
  WHERE training_id = NEW.training_id
    AND enrollment_status IS DISTINCT FROM 'cancelado';

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Treinamento com vagas esgotadas (limite: %)', v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_capacity_on_enroll ON training_participants;
CREATE TRIGGER enforce_capacity_on_enroll
BEFORE INSERT ON training_participants
FOR EACH ROW EXECUTE FUNCTION enforce_training_capacity();


-- Trigger 2: mantém participants_count correto automaticamente via incremento atômico
-- Substitui todas as atualizações client-side que tinham race condition.
CREATE OR REPLACE FUNCTION sync_training_participant_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.enrollment_status IS DISTINCT FROM 'cancelado' THEN
      UPDATE trainings
      SET participants_count = participants_count + 1
      WHERE id = NEW.training_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.enrollment_status IS DISTINCT FROM 'cancelado' THEN
      UPDATE trainings
      SET participants_count = GREATEST(0, participants_count - 1)
      WHERE id = OLD.training_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Ativo → cancelado: libera vaga
    IF OLD.enrollment_status IS DISTINCT FROM 'cancelado'
       AND NEW.enrollment_status = 'cancelado' THEN
      UPDATE trainings
      SET participants_count = GREATEST(0, participants_count - 1)
      WHERE id = NEW.training_id;
    -- Cancelado → ativo: ocupa vaga
    ELSIF OLD.enrollment_status = 'cancelado'
          AND NEW.enrollment_status IS DISTINCT FROM 'cancelado' THEN
      UPDATE trainings
      SET participants_count = participants_count + 1
      WHERE id = NEW.training_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_participant_count ON training_participants;
CREATE TRIGGER sync_participant_count
AFTER INSERT OR DELETE OR UPDATE OF enrollment_status ON training_participants
FOR EACH ROW EXECUTE FUNCTION sync_training_participant_count();


-- Recalcula contadores existentes para corrigir qualquer inconsistência acumulada
UPDATE trainings t
SET participants_count = (
  SELECT COUNT(*)
  FROM training_participants tp
  WHERE tp.training_id = t.id
    AND tp.enrollment_status IS DISTINCT FROM 'cancelado'
);
