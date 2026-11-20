-- ============================================================================
-- LouDent migration 5/5 — clinic catalogue seed (GENERATED, do not hand-edit)
-- Source: server/src/seed-data.json via scripts/generate-seed-sql.mjs
-- Seeds ONLY public clinic content. Creates no user accounts and no
-- appointments. ON CONFLICT DO NOTHING: re-running never overwrites edits.
-- ============================================================================

INSERT INTO public.dentists (id, name, title, specialty, experience_years, bio, photo_url) VALUES
  ('santos', 'Dr. Maria Santos', 'DMD', 'General & Cosmetic Dentistry', 8, 'Dr. Santos is a dedicated general and cosmetic dentist with 8 years of experience transforming smiles across Cebu City. She earned her DMD from the University of Santo Tomas and has completed advanced training in cosmetic dentistry and minimally invasive procedures. Known for her gentle approach and thorough explanations, she makes every patient feel at ease.', 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=300&h=300&fit=crop&auto=format'),
  ('reyes', 'Dr. Adrian Reyes', 'DMD, MOrth', 'Orthodontics', 6, 'Dr. Reyes is an experienced orthodontist specializing in braces, clear aligners, and bite correction. He completed his Masters in Orthodontics from the University of the Philippines Manila and has treated hundreds of patients from teenagers to adults. He combines clinical precision with a warm, patient-centered style to deliver results that last a lifetime.', 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=300&h=300&fit=crop&auto=format')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.services (id, name, category, duration_minutes, price, icon, description, preparation, involves) VALUES
  ('checkup', 'Dental Check-up', 'General Dentistry', 30, 500, '🔍', 'A thorough oral examination to assess your dental health, detect issues early, and plan the right course of treatment.', 'No special preparation needed. Bring any previous dental records or X-rays if available.', '["Full oral cavity examination","Gum and tissue health assessment","X-ray review if needed","Personalized treatment recommendations","Open Q&A with your dentist"]'::jsonb),
  ('cleaning', 'Teeth Cleaning', 'General Dentistry', 45, 1000, '✨', 'Professional prophylaxis to remove plaque, tartar, and surface stains — leaving your teeth clean, polished, and feeling fresh.', 'Brush your teeth normally before your visit. Avoid a heavy meal right before your appointment.', '["Ultrasonic scaling to remove tartar buildup","Hand scaling for precision cleaning","Polishing with professional-grade paste","Flossing and fluoride rinse"]'::jsonb),
  ('filling', 'Tooth Filling', 'General Dentistry', 40, 1500, '🦷', 'Tooth-colored composite fillings to restore teeth damaged by cavities, restoring both function and natural appearance.', 'Eat a light meal beforehand — the treated area may be numb for a few hours after the procedure.', '["Local anesthesia for your comfort","Removal of decayed tooth material","Composite resin placement and shaping","Bite adjustment and polishing"]'::jsonb),
  ('extraction', 'Tooth Extraction', 'General Dentistry', 40, 1000, '🪄', 'Safe, minimally painful removal of a severely damaged, decayed, or problematic tooth by our experienced dentists.', 'Avoid blood-thinning medications if possible. Arrange for someone to accompany you if sedation is used.', '["Pre-extraction clinical assessment","Local anesthesia administration","Careful tooth loosening and removal","Post-extraction care and medication instructions"]'::jsonb),
  ('whitening', 'Teeth Whitening', 'General Dentistry', 50, 8000, '⭐', 'Professional in-office whitening that safely lightens your enamel by several shades for a brighter, more confident smile.', 'Avoid strongly colored foods and beverages 48 hours before and after treatment. Treat any cavities before whitening.', '["Pre-treatment shade assessment","Gum protection and isolation","Professional-grade whitening gel application","LED light activation for enhanced results","Post-treatment care instructions"]'::jsonb),
  ('wisdom', 'Wisdom Tooth Extraction', 'General Dentistry', 60, 2500, '🧠', 'Safe removal of impacted or problematic wisdom teeth to relieve pain, prevent crowding, and avoid future complications.', 'Fast for at least 6 hours before sedation. Arrange for someone to accompany you home.', '["Panoramic X-ray to assess positioning","Local anesthesia or sedation options","Surgical extraction with minimal trauma","Post-operative care kit and instructions"]'::jsonb),
  ('partial-dentures', 'Partial Dentures', 'General Dentistry', 45, 6000, '🦷', 'Removable partial dentures designed to replace one or more missing teeth while preserving your remaining natural teeth.', 'Multiple visits are required. Inform your dentist of any existing health conditions or medications.', '["Clinical assessment and impressions","Custom partial denture fabrication","Wax try-in for fit and comfort review","Final fitting and bite adjustments","Care and maintenance instructions"]'::jsonb),
  ('full-dentures', 'Full Dentures', 'General Dentistry', 60, 15000, '🦷', 'Complete removable dentures for patients who have lost all or most of their natural teeth, restoring appearance and function.', 'Multiple visits over several weeks are needed. Bring a list of any current medications to your first appointment.', '["Comprehensive assessment and jaw measurements","Impressions for both upper and lower arches","Wax try-in appointments for aesthetics and fit","Final denture delivery and adjustment","Follow-up fitting appointments as needed"]'::jsonb),
  ('pediatric', 'Pediatric Dental Care', 'General Dentistry', 30, 600, '🧒', 'Child-friendly dental check-ups, cleanings, and preventive treatments in a calm environment designed for young patients.', 'Bring your child''s dental records if available. Morning appointments are usually best for young children.', '["Child-adapted oral examination","Gentle cleaning and polishing","Fluoride application if recommended","Parent education on home care habits"]'::jsonb),
  ('veneers', 'Veneers', 'General Dentistry', 60, 12000, '💎', 'Thin, custom-made porcelain or composite shells bonded to the front of teeth to improve color, shape, size, or length.', 'Discuss aesthetic goals with your dentist beforehand. Good oral health is required before veneers are placed.', '["Initial smile assessment and shade selection","Minimal enamel removal for bonding surface","Impression or digital scan for fabrication","Temporary veneers placed while lab fabricates finals","Permanent veneer bonding and bite check"]'::jsonb),
  ('braces-combo', 'Braces Consultation & Adjustment', 'Orthodontics', 30, 1000, '😁', 'Orthodontic consultation, treatment assessment, and scheduled braces adjustment — all in one visit.', 'Brush thoroughly before your visit. Eat a soft meal beforehand — teeth may feel tender after adjustment.', '["Orthodontic examination and progress review","Wire removal and replacement","Bracket checks and tightening as needed","Photos and documentation of treatment progress","Next adjustment scheduling"]'::jsonb),
  ('braces-install', 'Braces Installation', 'Orthodontics', 90, 40000, '🦷', 'Initial placement of orthodontic braces to gradually align and straighten the teeth. Includes both upper and lower arches.', 'An initial consultation is required before installation. Additional procedures (X-rays, fillings, extractions) may be needed and are quoted separately.', '["Initial orthodontic consultation and full assessment","Placement of metal brackets on upper and lower arches","Orthodontic wires and ties","Patient education on care and maintenance","Scheduled follow-up adjustment appointments","Final retainer quoted separately after treatment"]'::jsonb),
  ('retainer', 'Retainer', 'Orthodontics', 30, 5000, '⭕', 'A custom-made retainer to maintain your teeth alignment after braces treatment is complete.', 'Retainer is placed after braces are removed. Bring any previous orthodontic records to your appointment.', '["Post-braces assessment and impressions","Custom retainer fabrication","Fitting and bite check","Instructions on wear schedule and maintenance"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dentist_services (dentist_id, service_id) VALUES
  ('santos', 'checkup'),
  ('santos', 'cleaning'),
  ('santos', 'filling'),
  ('santos', 'extraction'),
  ('santos', 'whitening'),
  ('santos', 'wisdom'),
  ('santos', 'partial-dentures'),
  ('santos', 'full-dentures'),
  ('santos', 'pediatric'),
  ('santos', 'veneers'),
  ('reyes', 'checkup'),
  ('reyes', 'extraction'),
  ('reyes', 'braces-combo'),
  ('reyes', 'braces-install'),
  ('reyes', 'retainer')
ON CONFLICT DO NOTHING;

INSERT INTO public.dentist_schedules (dentist_id, day_of_week, available, start_time, end_time, break_start, break_end) VALUES
  ('santos', 0, true, '09:00', '17:00', NULL, NULL),
  ('santos', 1, true, '09:00', '17:00', NULL, NULL),
  ('santos', 2, false, '09:00', '17:00', NULL, NULL),
  ('santos', 3, true, '09:00', '17:00', NULL, NULL),
  ('santos', 4, true, '09:00', '15:00', NULL, NULL),
  ('santos', 5, false, '09:00', '17:00', NULL, NULL),
  ('santos', 6, false, '09:00', '17:00', NULL, NULL),
  ('reyes', 0, true, '09:00', '17:00', NULL, NULL),
  ('reyes', 1, false, '09:00', '17:00', NULL, NULL),
  ('reyes', 2, true, '09:00', '17:00', NULL, NULL),
  ('reyes', 3, false, '09:00', '17:00', NULL, NULL),
  ('reyes', 4, true, '09:00', '17:00', NULL, NULL),
  ('reyes', 5, true, '09:00', '15:00', NULL, NULL),
  ('reyes', 6, false, '09:00', '17:00', NULL, NULL)
ON CONFLICT DO NOTHING;
