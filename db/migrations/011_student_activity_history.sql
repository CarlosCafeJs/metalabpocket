-- Append-only student activity history. Binary file contents and session secrets
-- are intentionally excluded from event payloads.
CREATE TABLE IF NOT EXISTS metalab_student_activity_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  actor_student_id UUID REFERENCES metalab_students(id) ON DELETE SET NULL,
  class_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_role VARCHAR(12) NOT NULL CHECK (actor_role IN ('student','teacher','system')),
  event_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_table VARCHAR(80) NOT NULL,
  source_row_id TEXT NOT NULL,
  legacy BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS metalab_student_activity_student_time_idx
  ON metalab_student_activity_events (student_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS metalab_student_activity_actor_time_idx
  ON metalab_student_activity_events (actor_student_id, occurred_at DESC, id DESC)
  WHERE actor_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS metalab_student_activity_class_time_idx
  ON metalab_student_activity_events (class_id, occurred_at DESC, id DESC)
  WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metalab_student_activity_legacy_source_uidx
  ON metalab_student_activity_events (source_table, source_row_id, event_type)
  WHERE legacy = TRUE;

CREATE OR REPLACE FUNCTION metalab_record_student_activity(
  p_student_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_payload JSONB,
  p_source_table TEXT,
  p_source_row_id TEXT,
  p_class_id UUID DEFAULT NULL,
  p_actor_role TEXT DEFAULT NULL,
  p_actor_student_id UUID DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_legacy BOOLEAN DEFAULT FALSE
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_student_id IS NULL THEN RETURN; END IF;
  v_role := COALESCE(
    NULLIF(current_setting('metalab.actor_role', TRUE), ''),
    p_actor_role,
    'system'
  );
  IF v_role NOT IN ('student','teacher','system') THEN v_role := 'system'; END IF;

  INSERT INTO metalab_student_activity_events (
    student_id, actor_student_id, class_id, occurred_at, actor_role,
    event_type, entity_type, entity_id, payload, source_table,
    source_row_id, legacy
  ) VALUES (
    p_student_id, p_actor_student_id, p_class_id,
    COALESCE(p_occurred_at, clock_timestamp()), v_role,
    p_event_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'::JSONB),
    p_source_table, p_source_row_id, p_legacy
  ) ON CONFLICT (source_table, source_row_id, event_type) WHERE legacy = TRUE
    DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION metalab_capture_student_activity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_new JSONB;
  v_old JSONB;
  v_student UUID;
  v_actor UUID;
  v_class UUID;
  v_post_owner UUID;
  v_post_body TEXT;
  v_post_image_name TEXT;
  v_post_image_mime TEXT;
  v_post_has_image BOOLEAN;
  v_event TEXT;
  v_payload JSONB;
  v_role TEXT;
  v_entity_id TEXT;
  v_class_name TEXT;
  v_count BIGINT;
  v_like_count BIGINT;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME='metalab_student_photos' THEN
      v_new:=jsonb_build_object('id',NEW.id,'student_id',NEW.student_id,'file_name',NEW.file_name,'product',NEW.product,'angle',NEW.angle,'height',NEW.height,'mime_type',NEW.mime_type,'size_bytes',NEW.size_bytes,'created_at',NEW.created_at);
    ELSIF TG_TABLE_NAME='metalab_student_deliveries' THEN
      v_new:=jsonb_build_object('id',NEW.id,'student_id',NEW.student_id,'activity_name',NEW.activity_name,'description',NEW.description,'class_date',NEW.class_date,'file_name',NEW.file_name,'mime_type',NEW.mime_type,'size_bytes',NEW.size_bytes,'created_at',NEW.created_at,'quick_mission_id',NEW.quick_mission_id);
    ELSIF TG_TABLE_NAME='metalab_instalab_posts' THEN
      v_new:=jsonb_build_object('id',NEW.id,'student_id',NEW.student_id,'class_id',NEW.class_id,'body',NEW.body,'image_name',NEW.image_name,'image_mime_type',NEW.image_mime_type,'image_size_bytes',NEW.image_size_bytes,'image_present',NEW.image_data IS NOT NULL,'created_at',NEW.created_at);
    ELSIF TG_TABLE_NAME='metalab_student_sessions' THEN
      v_new:=jsonb_build_object('id',NEW.id,'student_id',NEW.student_id,'created_at',NEW.created_at,'revoked_at',NEW.revoked_at);
    ELSE v_new:=to_jsonb(NEW);
    END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    IF TG_TABLE_NAME='metalab_student_photos' THEN
      v_old:=jsonb_build_object('id',OLD.id,'student_id',OLD.student_id,'file_name',OLD.file_name,'product',OLD.product,'angle',OLD.angle,'height',OLD.height,'mime_type',OLD.mime_type,'size_bytes',OLD.size_bytes,'created_at',OLD.created_at);
    ELSIF TG_TABLE_NAME='metalab_student_deliveries' THEN
      v_old:=jsonb_build_object('id',OLD.id,'student_id',OLD.student_id,'activity_name',OLD.activity_name,'description',OLD.description,'class_date',OLD.class_date,'file_name',OLD.file_name,'mime_type',OLD.mime_type,'size_bytes',OLD.size_bytes,'created_at',OLD.created_at,'quick_mission_id',OLD.quick_mission_id);
    ELSIF TG_TABLE_NAME='metalab_instalab_posts' THEN
      v_old:=jsonb_build_object('id',OLD.id,'student_id',OLD.student_id,'class_id',OLD.class_id,'body',OLD.body,'image_name',OLD.image_name,'image_mime_type',OLD.image_mime_type,'image_size_bytes',OLD.image_size_bytes,'image_present',OLD.image_data IS NOT NULL,'created_at',OLD.created_at);
    ELSIF TG_TABLE_NAME='metalab_student_sessions' THEN
      v_old:=jsonb_build_object('id',OLD.id,'student_id',OLD.student_id,'created_at',OLD.created_at,'revoked_at',OLD.revoked_at);
    ELSE v_old:=to_jsonb(OLD);
    END IF;
  END IF;
  v_student := COALESCE((v_new->>'student_id')::UUID, (v_old->>'student_id')::UUID);
  v_entity_id := COALESCE(v_new->>'id', v_old->>'id', v_new->>'mission_id', v_old->>'mission_id');
  v_role := NULLIF(current_setting('metalab.actor_role', TRUE), '');

  IF TG_TABLE_NAME = 'metalab_businesses' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID, (v_old->>'student_id')::UUID);
    SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student;
    v_entity_id := COALESCE(v_new->>'id', v_old->>'id');
    IF TG_OP = 'INSERT' THEN
      v_event := 'business.created';
      v_payload := jsonb_build_object('after', jsonb_build_object(
        'name',v_new->'name','segment',v_new->'segment','description',v_new->'description',
        'mainOffering',v_new->'main_offering','targetAudience',v_new->'target_audience',
        'differentiator',v_new->'differentiator','primaryColor',v_new->'primary_color'));
    ELSIF TG_OP = 'UPDATE' AND ROW(v_old->'name',v_old->'segment',v_old->'description',v_old->'main_offering',v_old->'target_audience',v_old->'differentiator',v_old->'primary_color') IS DISTINCT FROM ROW(v_new->'name',v_new->'segment',v_new->'description',v_new->'main_offering',v_new->'target_audience',v_new->'differentiator',v_new->'primary_color') THEN
      v_event := 'business.updated';
      v_payload := jsonb_build_object(
        'before',jsonb_build_object('name',v_old->'name','segment',v_old->'segment','description',v_old->'description','mainOffering',v_old->'main_offering','targetAudience',v_old->'target_audience','differentiator',v_old->'differentiator','primaryColor',v_old->'primary_color'),
        'after',jsonb_build_object('name',v_new->'name','segment',v_new->'segment','description',v_new->'description','mainOffering',v_new->'main_offering','targetAudience',v_new->'target_audience','differentiator',v_new->'differentiator','primaryColor',v_new->'primary_color'));
    ELSE RETURN NULL; END IF;
    PERFORM metalab_record_student_activity(v_student,v_event,'business',v_entity_id,v_payload,TG_TABLE_NAME,v_entity_id,v_class,COALESCE(v_role,'student'));

  ELSIF TG_TABLE_NAME = 'metalab_mission_progress' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID, (v_old->>'student_id')::UUID);
    SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student;
    v_entity_id := COALESCE(v_new->>'mission_id',v_old->>'mission_id');
    IF TG_OP = 'INSERT' THEN
      v_event := 'mission.started';
      v_payload := jsonb_build_object('status',v_new->'status','answer',v_new->'answer','evidence',v_new->'evidence','feedback',v_new->'feedback','attemptCount',v_new->'attempt_count');
      PERFORM metalab_record_student_activity(v_student,v_event,'mission',v_entity_id,v_payload,TG_TABLE_NAME,v_new->>'id',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'started_at')::TIMESTAMPTZ);
      IF v_new->>'status' = 'completed' THEN
        PERFORM metalab_record_student_activity(v_student,'mission.completed','mission',v_entity_id,v_payload,TG_TABLE_NAME,v_new->>'id'||':completed',v_class,COALESCE(v_role,'student'),NULL,COALESCE((v_new->>'completed_at')::TIMESTAMPTZ,clock_timestamp()));
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND ROW(v_old->'status',v_old->'answer',v_old->'evidence',v_old->'feedback',v_old->'attempt_count') IS DISTINCT FROM ROW(v_new->'status',v_new->'answer',v_new->'evidence',v_new->'feedback',v_new->'attempt_count') THEN
      v_event := CASE WHEN v_old->>'status' <> 'completed' AND v_new->>'status' = 'completed' THEN 'mission.completed' ELSE 'mission.attempted' END;
      v_payload := jsonb_build_object('before',jsonb_build_object('status',v_old->'status','answer',v_old->'answer','evidence',v_old->'evidence','feedback',v_old->'feedback','attemptCount',v_old->'attempt_count'),'after',jsonb_build_object('status',v_new->'status','answer',v_new->'answer','evidence',v_new->'evidence','feedback',v_new->'feedback','attemptCount',v_new->'attempt_count'));
      PERFORM metalab_record_student_activity(v_student,v_event,'mission',v_entity_id,v_payload,TG_TABLE_NAME,v_new->>'id'||':'||COALESCE(v_new->>'attempt_count','update'),v_class,COALESCE(v_role,'student'),NULL,clock_timestamp());
    ELSE RETURN NULL; END IF;

  ELSIF TG_TABLE_NAME = 'metalab_teacher_task_submissions' THEN
    v_student := (v_new->>'student_id')::UUID;
    SELECT assignment.class_id,classroom.name INTO v_class,v_class_name FROM metalab_student_class_assignments assignment JOIN metalab_classes classroom ON classroom.id=assignment.class_id WHERE assignment.student_id = v_student;
    SELECT jsonb_build_object('prompt',task.prompt,'missionTitle',mission.title,'moduleTitle',module.title) INTO v_payload
      FROM metalab_teacher_tasks task JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
      JOIN metalab_teacher_modules module ON module.id=mission.module_id
      WHERE task.id=(v_new->>'task_id')::UUID;
    v_payload := COALESCE(v_payload,'{}'::JSONB) || jsonb_build_object('answer',v_new->'answer','taskId',v_new->'task_id','submittedAt',v_new->'submitted_at','responseId',v_new->'response_id','classId',v_class,'className',v_class_name);
    PERFORM metalab_record_student_activity(v_student,'classroom.task.submitted','classroom_task',v_new->>'task_id',v_payload,TG_TABLE_NAME,v_new->>'id',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'submitted_at')::TIMESTAMPTZ);

  ELSIF TG_TABLE_NAME = 'metalab_student_deliveries' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student;
    IF TG_OP='INSERT' THEN
      v_event := CASE WHEN v_new->>'quick_mission_id' IS NULL THEN 'delivery.submitted' ELSE 'quick_mission.submitted' END;
      v_payload := jsonb_build_object('activityName',v_new->'activity_name','description',v_new->'description','classDate',v_new->'class_date','fileName',v_new->'file_name','mimeType',v_new->'mime_type','sizeBytes',v_new->'size_bytes','quickMissionId',v_new->'quick_mission_id');
      PERFORM metalab_record_student_activity(v_student,v_event,'delivery',v_new->>'id',v_payload,TG_TABLE_NAME,v_new->>'id',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'created_at')::TIMESTAMPTZ);
    ELSIF TG_OP='DELETE' THEN
      v_event := CASE WHEN v_old->>'quick_mission_id' IS NULL THEN 'delivery.deleted' ELSE 'quick_mission.delivery_deleted' END;
      v_payload := jsonb_build_object('activityName',v_old->'activity_name','description',v_old->'description','classDate',v_old->'class_date','fileName',v_old->'file_name','mimeType',v_old->'mime_type','quickMissionId',v_old->'quick_mission_id');
      PERFORM metalab_record_student_activity(v_student,v_event,'delivery',v_old->>'id',v_payload,TG_TABLE_NAME,v_old->>'id'||':deleted:'||clock_timestamp(),v_class,COALESCE(v_role,'student'),NULL,clock_timestamp());
    ELSE RETURN NULL; END IF;

  ELSIF TG_TABLE_NAME = 'metalab_student_photos' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student;
    IF TG_OP='INSERT' THEN
      v_payload := jsonb_build_object('fileName',v_new->'file_name','product',v_new->'product','angle',v_new->'angle','height',v_new->'height','mimeType',v_new->'mime_type','sizeBytes',v_new->'size_bytes','receivedAt',v_new->'created_at','captureTimeTrusted',false);
      PERFORM metalab_record_student_activity(v_student,'camera.photo_received','photo',v_new->>'id',v_payload,TG_TABLE_NAME,v_new->>'id',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'created_at')::TIMESTAMPTZ);
    ELSIF TG_OP='DELETE' THEN
      v_payload := jsonb_build_object('fileName',v_old->'file_name','product',v_old->'product','angle',v_old->'angle','height',v_old->'height','mimeType',v_old->'mime_type','sizeBytes',v_old->'size_bytes','removed',true);
      PERFORM metalab_record_student_activity(v_student,'camera.photo_removed','photo',v_old->>'id',v_payload,TG_TABLE_NAME,v_old->>'id'||':deleted:'||clock_timestamp(),v_class,COALESCE(v_role,'student'),NULL,clock_timestamp());
    ELSIF TG_OP='UPDATE' AND (ROW(v_old->'file_name',v_old->'product',v_old->'angle',v_old->'height',v_old->'mime_type',v_old->'size_bytes') IS DISTINCT FROM ROW(v_new->'file_name',v_new->'product',v_new->'angle',v_new->'height',v_new->'mime_type',v_new->'size_bytes') OR OLD.image_data IS DISTINCT FROM NEW.image_data) THEN
      v_payload:=jsonb_build_object('before',jsonb_build_object('fileName',v_old->'file_name','product',v_old->'product','angle',v_old->'angle','height',v_old->'height','mimeType',v_old->'mime_type','sizeBytes',v_old->'size_bytes'),'after',jsonb_build_object('fileName',v_new->'file_name','product',v_new->'product','angle',v_new->'angle','height',v_new->'height','mimeType',v_new->'mime_type','sizeBytes',v_new->'size_bytes'));
      PERFORM metalab_record_student_activity(v_student,'camera.photo_updated','photo',v_new->>'id',v_payload,TG_TABLE_NAME,v_new->>'id'||':update:'||clock_timestamp(),v_class,COALESCE(v_role,'student'));
    ELSE RETURN NULL; END IF;

  ELSIF TG_TABLE_NAME = 'metalab_instalab_posts' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    v_class := COALESCE((v_new->>'class_id')::UUID,(v_old->>'class_id')::UUID);
    IF TG_OP='INSERT' THEN
      v_event := 'instalab.post_created';
      v_payload := jsonb_build_object('body',v_new->'body','imageName',v_new->'image_name','imageMimeType',v_new->'image_mime_type','hasImage',v_new->'image_present');
      PERFORM metalab_record_student_activity(v_student,v_event,'instalab_post',v_new->>'id',v_payload,TG_TABLE_NAME,v_new->>'id',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'created_at')::TIMESTAMPTZ);
    ELSIF TG_OP='UPDATE' AND ROW(v_old->'body',v_old->'image_name',v_old->'image_mime_type',v_old->'image_size_bytes',v_old->'image_present') IS DISTINCT FROM ROW(v_new->'body',v_new->'image_name',v_new->'image_mime_type',v_new->'image_size_bytes',v_new->'image_present') THEN
      v_payload := jsonb_build_object('before',jsonb_build_object('body',v_old->'body','imageName',v_old->'image_name','imageMimeType',v_old->'image_mime_type','hasImage',v_old->'image_present'),'after',jsonb_build_object('body',v_new->'body','imageName',v_new->'image_name','imageMimeType',v_new->'image_mime_type','hasImage',v_new->'image_present'));
      PERFORM metalab_record_student_activity(v_student,'instalab.post_edited','instalab_post',v_new->>'id',v_payload,TG_TABLE_NAME,v_new->>'id'||':edit:'||clock_timestamp(),v_class,COALESCE(v_role,'student'));
    ELSIF TG_OP='DELETE' THEN
      SELECT COUNT(*) INTO v_count FROM metalab_instalab_comments WHERE post_id=(v_old->>'id')::UUID;
      SELECT COUNT(*) INTO v_like_count FROM metalab_instalab_likes WHERE post_id=(v_old->>'id')::UUID;
      v_payload := jsonb_build_object('body',v_old->'body','imageName',v_old->'image_name','imageMimeType',v_old->'image_mime_type','hasImage',v_old->'image_present','commentsPresentAtRemoval',v_count,'likesPresentAtRemoval',v_like_count);
      PERFORM metalab_record_student_activity(v_student,'instalab.post_deleted','instalab_post',v_old->>'id',v_payload,TG_TABLE_NAME,v_old->>'id'||':deleted:'||clock_timestamp(),v_class,COALESCE(v_role,'teacher'));
    ELSE RETURN NULL; END IF;

  ELSIF TG_TABLE_NAME = 'metalab_instalab_likes' THEN
    v_class := NULL;
    SELECT post.student_id,post.class_id,post.body,post.image_name,post.image_mime_type,(post.image_data IS NOT NULL) INTO v_post_owner,v_class,v_post_body,v_post_image_name,v_post_image_mime,v_post_has_image FROM metalab_instalab_posts post WHERE post.id=COALESCE((v_new->>'post_id')::UUID,(v_old->>'post_id')::UUID);
    IF v_post_owner IS NULL THEN RETURN NULL; END IF;
    v_student := v_post_owner;
    v_actor := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    v_role := CASE WHEN COALESCE((v_new->>'teacher_like')::BOOLEAN,(v_old->>'teacher_like')::BOOLEAN,FALSE) THEN 'teacher' ELSE COALESCE(v_role,'student') END;
    v_event := CASE WHEN TG_OP='INSERT' THEN 'instalab.like_added' ELSE 'instalab.like_removed' END;
    v_payload := jsonb_build_object('postId',COALESCE(v_new->'post_id',v_old->'post_id'),'actorName',(SELECT student.full_name FROM metalab_students student WHERE student.id=v_actor),'teacherLike',COALESCE((v_new->>'teacher_like')::BOOLEAN,(v_old->>'teacher_like')::BOOLEAN,FALSE),'postSnapshot',jsonb_build_object('body',v_post_body,'imageName',v_post_image_name,'imageMimeType',v_post_image_mime,'hasImage',v_post_has_image));
    PERFORM metalab_record_student_activity(v_student,v_event,'instalab_post',COALESCE(v_new->>'post_id',v_old->>'post_id'),v_payload,TG_TABLE_NAME,COALESCE(v_new->>'post_id',v_old->>'post_id')||':'||COALESCE(v_new->>'student_id','teacher')||':'||clock_timestamp(),v_class,v_role,v_actor);

  ELSIF TG_TABLE_NAME = 'metalab_instalab_comments' THEN
    SELECT post.student_id,post.class_id,post.body,post.image_name,post.image_mime_type,(post.image_data IS NOT NULL) INTO v_post_owner,v_class,v_post_body,v_post_image_name,v_post_image_mime,v_post_has_image FROM metalab_instalab_posts post WHERE post.id=COALESCE((v_new->>'post_id')::UUID,(v_old->>'post_id')::UUID);
    IF v_post_owner IS NULL THEN RETURN NULL; END IF;
    v_student := v_post_owner;
    v_actor := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    v_role := COALESCE(v_role,v_new->>'author_role',v_old->>'author_role','student');
    v_event := CASE WHEN TG_OP='INSERT' THEN 'instalab.comment_added' ELSE 'instalab.comment_removed' END;
    v_payload := jsonb_build_object('postId',COALESCE(v_new->'post_id',v_old->'post_id'),'commentId',COALESCE(v_new->'id',v_old->'id'),'body',COALESCE(v_new->'body',v_old->'body'),'authorName',COALESCE(v_new->'author_name',v_old->'author_name'),'postSnapshot',jsonb_build_object('body',v_post_body,'imageName',v_post_image_name,'imageMimeType',v_post_image_mime,'hasImage',v_post_has_image));
    PERFORM metalab_record_student_activity(v_student,v_event,'instalab_post',COALESCE(v_new->>'post_id',v_old->>'post_id'),v_payload,TG_TABLE_NAME,COALESCE(v_new->>'id',v_old->>'id')||':'||TG_OP||':'||clock_timestamp(),v_class,v_role,v_actor);

  ELSIF TG_TABLE_NAME = 'metalab_student_class_assignments' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    SELECT name INTO v_class_name FROM metalab_classes WHERE id=(v_new->>'class_id')::UUID;
    IF TG_OP='INSERT' THEN
      v_class := (v_new->>'class_id')::UUID;
      v_event := 'class.joined';
      v_payload := jsonb_build_object('className',v_class_name,'assignedAt',v_new->'assigned_at');
    ELSIF TG_OP='DELETE' THEN
      v_class := (v_old->>'class_id')::UUID;
      SELECT name INTO v_class_name FROM metalab_classes WHERE id=v_class;
      v_event := 'class.left';
      v_payload := jsonb_build_object('className',v_class_name,'removed',true);
    ELSE
      v_class := (v_new->>'class_id')::UUID;
      SELECT name INTO v_class_name FROM metalab_classes WHERE id=(v_old->>'class_id')::UUID;
      v_event := 'class.transferred';
      v_payload := jsonb_build_object('fromClassId',v_old->'class_id','fromClassName',v_class_name,'toClassId',v_new->'class_id','toClassName',(SELECT name FROM metalab_classes WHERE id=v_class),'assignedAt',v_new->'assigned_at');
    END IF;
    PERFORM metalab_record_student_activity(v_student,v_event,'class',v_class::TEXT,v_payload,TG_TABLE_NAME,COALESCE(v_new->>'student_id',v_old->>'student_id')||':'||clock_timestamp(),v_class,COALESCE(v_role,CASE WHEN TG_OP='DELETE' THEN 'teacher' ELSE 'system' END),NULL,CASE WHEN TG_OP='INSERT' THEN (v_new->>'assigned_at')::TIMESTAMPTZ ELSE clock_timestamp() END);

  ELSIF TG_TABLE_NAME = 'metalab_student_sessions' THEN
    v_student := COALESCE((v_new->>'student_id')::UUID,(v_old->>'student_id')::UUID);
    SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student;
    IF TG_OP='INSERT' THEN
      PERFORM metalab_record_student_activity(v_student,'session.started','session',v_new->>'id','{}'::JSONB,TG_TABLE_NAME,v_new->>'id',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'created_at')::TIMESTAMPTZ);
    ELSIF TG_OP='UPDATE' AND v_old->>'revoked_at' IS NULL AND v_new->>'revoked_at' IS NOT NULL THEN
      PERFORM metalab_record_student_activity(v_student,'session.ended','session',v_new->>'id',jsonb_build_object('endedAt',v_new->'revoked_at'),TG_TABLE_NAME,v_new->>'id'||':ended',v_class,COALESCE(v_role,'student'),NULL,(v_new->>'revoked_at')::TIMESTAMPTZ);
    ELSE RETURN NULL; END IF;

  ELSIF TG_TABLE_NAME = 'metalab_students' THEN
    v_student := (v_new->>'id')::UUID;
    SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student;
    IF TG_OP='INSERT' THEN
      PERFORM metalab_record_student_activity(v_student,'student.registered','student',v_new->>'id',jsonb_build_object('fullName',v_new->'full_name','createdAt',v_new->'created_at'),TG_TABLE_NAME,v_new->>'id',NULL,'student',NULL,(v_new->>'created_at')::TIMESTAMPTZ);
    ELSIF TG_OP='UPDATE' AND v_old->>'archived_at' IS DISTINCT FROM v_new->>'archived_at' THEN
      v_event := CASE WHEN v_new->>'archived_at' IS NULL THEN 'student.restored' ELSE 'student.archived' END;
      PERFORM metalab_record_student_activity(v_student,v_event,'student',v_new->>'id',jsonb_build_object('archivedAt',v_new->'archived_at'),TG_TABLE_NAME,v_new->>'id'||':'||v_event||':'||clock_timestamp(),v_class,COALESCE(v_role,'teacher'));
    ELSE RETURN NULL; END IF;
  ELSE
    RETURN NULL;
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION metalab_prevent_student_activity_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Student activity history is append-only' USING ERRCODE='55000';
END $$;

DROP TRIGGER IF EXISTS metalab_student_activity_append_only ON metalab_student_activity_events;
CREATE TRIGGER metalab_student_activity_append_only
  BEFORE UPDATE OR DELETE ON metalab_student_activity_events
  FOR EACH ROW EXECUTE FUNCTION metalab_prevent_student_activity_mutation();

-- Drop first so rerunning the SQL manually never installs duplicate trigger paths.
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'metalab_businesses','metalab_mission_progress','metalab_teacher_task_submissions',
    'metalab_student_deliveries','metalab_student_photos','metalab_instalab_posts',
    'metalab_instalab_likes','metalab_instalab_comments','metalab_student_class_assignments',
    'metalab_student_sessions','metalab_students'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS metalab_activity_capture ON %I',table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS metalab_activity_capture_delete ON %I',table_name);
    IF table_name='metalab_instalab_posts' THEN
      EXECUTE format('CREATE TRIGGER metalab_activity_capture AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION metalab_capture_student_activity()',table_name);
      EXECUTE format('CREATE TRIGGER metalab_activity_capture_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION metalab_capture_student_activity()',table_name);
    ELSE
      EXECUTE format('CREATE TRIGGER metalab_activity_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION metalab_capture_student_activity()',table_name);
    END IF;
  END LOOP;
END $$;

-- Backfill only facts whose server timestamps are available. Legacy snapshots
-- explicitly mark data that cannot reconstruct overwritten versions or edits.
INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT student.id,student.created_at,'system','student.registered','student',student.id::TEXT,
  jsonb_build_object('legacy',true,'nameAtRegistrationAvailable',false),
  'metalab_students',student.id::TEXT,true FROM metalab_students student
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT photo.student_id,photo.created_at,'system','camera.photo_received','photo',photo.id::TEXT,
  jsonb_build_object('fileName',photo.file_name,'product',photo.product,'angle',photo.angle,'height',photo.height,'mimeType',photo.mime_type,'sizeBytes',photo.size_bytes,'receivedAt',photo.created_at,'captureTimeTrusted',false),
  'metalab_student_photos',photo.id::TEXT,true FROM metalab_student_photos photo
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT delivery.student_id,delivery.created_at,'system',CASE WHEN delivery.quick_mission_id IS NULL THEN 'delivery.submitted' ELSE 'quick_mission.submitted' END,'delivery',delivery.id::TEXT,
  jsonb_build_object('activityName',delivery.activity_name,'description',delivery.description,'classDate',delivery.class_date,'fileName',delivery.file_name,'mimeType',delivery.mime_type,'sizeBytes',delivery.size_bytes,'quickMissionId',delivery.quick_mission_id),
  'metalab_student_deliveries',delivery.id::TEXT,true FROM metalab_student_deliveries delivery
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,class_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT submission.student_id,NULL,submission.submitted_at,'system','classroom.task.submitted','classroom_task',submission.task_id::TEXT,
  jsonb_build_object('answer',submission.answer,'taskId',submission.task_id,'prompt',task.prompt,'missionTitle',mission.title,'moduleTitle',module.title,'submittedAt',submission.submitted_at,'responseId',submission.response_id,'legacy',true,'classAtSubmissionAvailable',false),
  'metalab_teacher_task_submissions',submission.id::TEXT,true
FROM metalab_teacher_task_submissions submission JOIN metalab_teacher_tasks task ON task.id=submission.task_id
JOIN metalab_teacher_missions mission ON mission.id=task.mission_id JOIN metalab_teacher_modules module ON module.id=mission.module_id
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,class_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT post.student_id,post.class_id,post.created_at,'system','instalab.post_created','instalab_post',post.id::TEXT,
  jsonb_build_object('legacy',true,'contentAvailable',false,'note','A legenda original não foi preservada antes do início do histórico.','imageName',post.image_name,'imageMimeType',post.image_mime_type,'hasImage',post.image_data IS NOT NULL),
  'metalab_instalab_posts',post.id::TEXT,true FROM metalab_instalab_posts post
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,actor_student_id,class_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT post.student_id,comment.student_id,post.class_id,comment.created_at,comment.author_role,'instalab.comment_added','instalab_post',post.id::TEXT,
  jsonb_build_object('postId',post.id,'commentId',comment.id,'body',comment.body,'authorName',comment.author_name,'legacy',true),
  'metalab_instalab_comments',comment.id::TEXT,true
FROM metalab_instalab_comments comment JOIN metalab_instalab_posts post ON post.id=comment.post_id
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,actor_student_id,class_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT post.student_id,likes.student_id,post.class_id,likes.created_at,CASE WHEN likes.teacher_like THEN 'teacher' ELSE 'system' END,'instalab.like_added','instalab_post',post.id::TEXT,
  jsonb_build_object('postId',post.id,'actorName',student.full_name,'teacherLike',likes.teacher_like,'legacy',true),
  'metalab_instalab_likes',post.id::TEXT||':'||COALESCE(likes.student_id::TEXT,'teacher'),true
FROM metalab_instalab_likes likes JOIN metalab_instalab_posts post ON post.id=likes.post_id
LEFT JOIN metalab_students student ON student.id=likes.student_id
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,class_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT assignment.student_id,assignment.class_id,assignment.assigned_at,'system','class.joined','class',assignment.class_id::TEXT,
  jsonb_build_object('className',class.name,'legacy',true,'previousClassHistoryAvailable',false),
  'metalab_student_class_assignments',assignment.student_id::TEXT,true
FROM metalab_student_class_assignments assignment JOIN metalab_classes class ON class.id=assignment.class_id
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT session.student_id,session.created_at,'system','session.started','session',session.id::TEXT,'{}'::JSONB,
  'metalab_student_sessions',session.id::TEXT,true FROM metalab_student_sessions session
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;
INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT session.student_id,session.revoked_at,'system','session.ended','session',session.id::TEXT,jsonb_build_object('endedAt',session.revoked_at),
  'metalab_student_sessions',session.id::TEXT||':ended',true FROM metalab_student_sessions session WHERE session.revoked_at IS NOT NULL
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;

-- Current state captured at installation time; this is a tracking baseline,
-- never represented as a historical edit or mission submission.
INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT business.student_id,clock_timestamp(),'system','business.baseline','business',business.id::TEXT,
  jsonb_build_object('snapshot',jsonb_build_object('name',business.name,'segment',business.segment,'description',business.description,'mainOffering',business.main_offering,'targetAudience',business.target_audience,'differentiator',business.differentiator,'primaryColor',business.primary_color),'priorVersionsAvailable',false),
  'metalab_businesses',business.id::TEXT,true FROM metalab_businesses business
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;
INSERT INTO metalab_student_activity_events (student_id,occurred_at,actor_role,event_type,entity_type,entity_id,payload,source_table,source_row_id,legacy)
SELECT progress.student_id,clock_timestamp(),'system','mission.baseline','mission',progress.mission_id,
  jsonb_build_object('snapshot',jsonb_build_object('status',progress.status,'answer',progress.answer,'evidence',progress.evidence,'feedback',progress.feedback,'attemptCount',progress.attempt_count,'startedAt',progress.started_at,'updatedAt',progress.updated_at,'completedAt',progress.completed_at),'priorAttemptsAvailable',false),
  'metalab_mission_progress',progress.id::TEXT,true FROM metalab_mission_progress progress
ON CONFLICT (source_table,source_row_id,event_type) WHERE legacy=TRUE DO NOTHING;
