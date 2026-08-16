-- Deterministic in-progress event. Preserves known real and test Clerk identities when present.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

DROP TABLE IF EXISTS _reset_identities;
CREATE TEMP TABLE _reset_identities AS
SELECT lower(email) AS email, clerk_user_id
FROM users
WHERE lower(email) IN ('organizer@example.com','guest@test.com','entrant@test.com');

DELETE FROM idempotency_keys;
DELETE FROM user_notice_states;
DELETE FROM official_results;
DELETE FROM audit_entries;
DELETE FROM vote_adjustments;
DELETE FROM pledges;
DELETE FROM chili_votes;
DELETE FROM chili_tags;
DELETE FROM chilis;
DELETE FROM users;
DELETE FROM tags;

INSERT INTO users (id,clerk_user_id,email,display_name,role,registration_completed_at,party_size,check_in_code,checked_in_at,checked_in_by_user_id,participation_disabled_at,participation_disabled_by_user_id,participation_disabled_reason,issued_vote_count,available_vote_count,created_at,updated_at,last_seen_at) VALUES
 (1,COALESCE((SELECT clerk_user_id FROM _reset_identities WHERE email='organizer@example.com'),'seed_admin_test'),'organizer@example.com','Organizer','admin','2026-07-22T13:00:00Z',1,NULL,'2026-07-22T13:00:00Z',NULL,NULL,NULL,NULL,0,0,'2026-07-22T13:00:00Z','2026-07-22T13:00:00Z','2026-07-22T15:03:00Z'),
 (2,COALESCE((SELECT clerk_user_id FROM _reset_identities WHERE email='guest@test.com'),'seed_guest_test'),'guest@test.com','Pepper Pal','guest','2026-07-22T13:05:00Z',3,'0042','2026-07-22T14:01:00Z',1,NULL,NULL,NULL,5,2,'2026-07-22T13:05:00Z','2026-07-22T15:10:00Z','2026-07-22T15:10:00Z'),
 (3,COALESCE((SELECT clerk_user_id FROM _reset_identities WHERE email='entrant@test.com'),'seed_entrant_test'),'entrant@test.com','Smoky Sam','contestant','2026-07-22T13:06:00Z',2,'1058','2026-07-22T14:02:00Z',1,NULL,NULL,NULL,2,1,'2026-07-22T13:06:00Z','2026-07-22T15:09:00Z','2026-07-22T15:09:00Z'),
 (4,'seed_guest_04','mara@rehearsal.invalid','Mara Ladle','guest','2026-07-22T13:08:00Z',4,'1204','2026-07-22T14:04:00Z',1,NULL,NULL,NULL,4,4,'2026-07-22T13:08:00Z','2026-07-22T14:04:00Z',NULL),
 (5,'seed_guest_05','eli@rehearsal.invalid','Eli Ember','guest','2026-07-22T13:10:00Z',2,'1315','2026-07-22T14:05:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:10:00Z','2026-07-22T14:05:00Z',NULL),
 (6,'seed_guest_06','june@rehearsal.invalid','June Spoon','guest','2026-07-22T13:12:00Z',5,'1426','2026-07-22T14:07:00Z',1,NULL,NULL,NULL,5,5,'2026-07-22T13:12:00Z','2026-07-22T14:07:00Z',NULL),
 (7,'seed_guest_07','otto@rehearsal.invalid','Otto Autumn','guest','2026-07-22T13:14:00Z',1,'1537','2026-07-22T14:08:00Z',1,NULL,NULL,NULL,1,1,'2026-07-22T13:14:00Z','2026-07-22T14:08:00Z',NULL),
 (8,'seed_guest_08','penny@rehearsal.invalid','Penny Pepper','guest','2026-07-22T13:16:00Z',3,'1648','2026-07-22T14:10:00Z',1,NULL,NULL,NULL,3,3,'2026-07-22T13:16:00Z','2026-07-22T14:10:00Z',NULL),
 (9,'seed_guest_09','ro@rehearsal.invalid','Ro Roaster','guest','2026-07-22T13:18:00Z',2,'1759','2026-07-22T14:12:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:18:00Z','2026-07-22T14:12:00Z',NULL),
 (10,'seed_contestant_10','bea@rehearsal.invalid','Bean Queen','contestant','2026-07-22T13:20:00Z',2,'2109','2026-07-22T14:14:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:20:00Z','2026-07-22T14:14:00Z',NULL),
 (11,'seed_contestant_11','russ@rehearsal.invalid','Rusty Ladle','contestant','2026-07-22T13:22:00Z',1,'2210','2026-07-22T14:16:00Z',1,NULL,NULL,NULL,1,1,'2026-07-22T13:22:00Z','2026-07-22T14:16:00Z',NULL),
 (12,'seed_contestant_12','holly@rehearsal.invalid','Holly Mole','contestant','2026-07-22T13:24:00Z',3,'2311','2026-07-22T14:18:00Z',1,NULL,NULL,NULL,3,3,'2026-07-22T13:24:00Z','2026-07-22T14:18:00Z',NULL),
 (13,'seed_contestant_13','ash@rehearsal.invalid','Ash Kettle','contestant','2026-07-22T13:26:00Z',2,'2412','2026-07-22T14:20:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:26:00Z','2026-07-22T14:20:00Z',NULL),
 (14,'seed_contestant_14','nash@rehearsal.invalid','Nash Heat','contestant','2026-07-22T13:28:00Z',1,'2513','2026-07-22T14:22:00Z',1,NULL,NULL,NULL,1,1,'2026-07-22T13:28:00Z','2026-07-22T14:22:00Z',NULL),
 (15,'seed_contestant_15','cam@rehearsal.invalid','Cam Fire','contestant','2026-07-22T13:30:00Z',2,'2614','2026-07-22T14:24:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:30:00Z','2026-07-22T14:24:00Z',NULL),
 (16,'seed_contestant_16','drew@rehearsal.invalid','Draft Drew','contestant','2026-07-22T13:32:00Z',1,'2715','2026-07-22T14:25:00Z',1,NULL,NULL,NULL,1,1,'2026-07-22T13:32:00Z','2026-07-22T14:25:00Z',NULL),
 (17,'seed_contestant_17','ivy@rehearsal.invalid','Ivy Simmer','contestant','2026-07-22T13:34:00Z',2,'2816',NULL,NULL,NULL,NULL,NULL,2,2,'2026-07-22T13:34:00Z','2026-07-22T13:34:00Z',NULL),
 (18,'seed_guest_18','kai@rehearsal.invalid','Kai Cozy','guest','2026-07-22T13:36:00Z',4,'3018','2026-07-22T14:28:00Z',1,NULL,NULL,NULL,4,4,'2026-07-22T13:36:00Z','2026-07-22T14:28:00Z',NULL),
 (19,'seed_guest_19','lou@rehearsal.invalid','Lou Bowl','guest','2026-07-22T13:38:00Z',1,'3119',NULL,NULL,NULL,NULL,NULL,1,1,'2026-07-22T13:38:00Z','2026-07-22T13:38:00Z',NULL),
 (20,'seed_guest_20','mo@rehearsal.invalid','Mo Spice','guest','2026-07-22T13:40:00Z',3,'3220','2026-07-22T14:30:00Z',1,NULL,NULL,NULL,3,3,'2026-07-22T13:40:00Z','2026-07-22T14:30:00Z',NULL),
 (21,'seed_guest_21','noa@rehearsal.invalid','Noa Napkin','guest','2026-07-22T13:42:00Z',2,'3321','2026-07-22T14:32:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:42:00Z','2026-07-22T14:32:00Z',NULL),
 (22,'seed_guest_22','orin@rehearsal.invalid','Orin Oven','guest','2026-07-22T13:44:00Z',1,'3422',NULL,NULL,NULL,NULL,NULL,1,1,'2026-07-22T13:44:00Z','2026-07-22T13:44:00Z',NULL),
 (23,'seed_guest_23','pia@rehearsal.invalid','Pia Pot','guest','2026-07-22T13:46:00Z',2,'3523','2026-07-22T14:34:00Z',1,NULL,NULL,NULL,2,2,'2026-07-22T13:46:00Z','2026-07-22T14:34:00Z',NULL),
 (24,'seed_guest_24','quinn@rehearsal.invalid','Quinn Cornbread','guest','2026-07-22T13:48:00Z',3,'3624','2026-07-22T14:36:00Z',1,NULL,NULL,NULL,3,3,'2026-07-22T13:48:00Z','2026-07-22T14:36:00Z',NULL),
 (25,'seed_guest_disabled','remy@rehearsal.invalid','Remy Roux','guest','2026-07-22T13:50:00Z',1,'3725','2026-07-22T14:38:00Z',1,'2026-07-22T15:00:00Z',1,'Duplicate prank account',1,1,'2026-07-22T13:50:00Z','2026-07-22T15:00:00Z',NULL);

INSERT INTO event_settings (id,event_name,pledge_goal_cents,gofundme_url,min_party_size,max_party_size,suggested_admission_cents,suggested_chili_entry_cents,suggested_additional_vote_cents,check_in_code_length,voting_is_open,standings_are_visible,results_are_final,results_finalized_at,results_finalized_by_user_id,created_at,updated_at) VALUES
 (1,'Chili Cookoff',100000,'https://www.gofundme.com/f/Heritage-family-adoption-fund?utm_source=chili_cookoff&utm_medium=referral&utm_campaign=heritage_family_adoption',1,20,1500,1000,1000,4,1,1,0,NULL,NULL,'2026-07-22T13:00:00Z','2026-07-22T15:00:00Z')
ON CONFLICT(id) DO UPDATE SET event_name=excluded.event_name,pledge_goal_cents=excluded.pledge_goal_cents,gofundme_url=excluded.gofundme_url,min_party_size=excluded.min_party_size,max_party_size=excluded.max_party_size,suggested_admission_cents=excluded.suggested_admission_cents,suggested_chili_entry_cents=excluded.suggested_chili_entry_cents,suggested_additional_vote_cents=excluded.suggested_additional_vote_cents,check_in_code_length=excluded.check_in_code_length,voting_is_open=excluded.voting_is_open,standings_are_visible=excluded.standings_are_visible,results_are_final=excluded.results_are_final,results_finalized_at=NULL,results_finalized_by_user_id=NULL,updated_at=excluded.updated_at;

INSERT INTO tags (id,name,slug,description,sort_order,is_active) VALUES
 (1,'Vegetarian','vegetarian','Made without meat.',10,1),(2,'Vegan','vegan','Made without animal products.',20,1),(3,'Gluten-free','gluten-free','Made without gluten-containing ingredients.',30,1),(4,'Dairy-free','dairy-free','Made without dairy ingredients.',40,1),(5,'Contains nuts','contains-nuts','Contains nuts or nut-derived ingredients.',50,1),(6,'Kid-friendly','kid-friendly','A gentler option for younger tasters.',60,1);

INSERT INTO chilis (id,cook_user_id,name,description,spice_level,image_object_key,status,status_reason,activated_at,activated_by_user_id,created_at,updated_at) VALUES
 (1,3,'Smoked Out','Brisket, fire-roasted tomatoes, and a patient ribbon of smoke.',3,NULL,'active',NULL,'2026-07-22T14:20:00Z',1,'2026-07-22T13:10:00Z','2026-07-22T14:20:00Z'),
 (2,10,'The Bean Ultimatum','A rich three-bean chili with charred poblano and lime.',2,NULL,'active',NULL,'2026-07-22T14:21:00Z',1,'2026-07-22T13:20:00Z','2026-07-22T14:21:00Z'),
 (3,11,'Red October','Classic beef chili with roasted red peppers and deep tomato flavor.',4,NULL,'active',NULL,'2026-07-22T14:22:00Z',1,'2026-07-22T13:22:00Z','2026-07-22T14:22:00Z'),
 (4,12,'Holy Mole','Turkey chili with cocoa, ancho chile, and warm spice.',3,NULL,'active',NULL,'2026-07-22T14:23:00Z',1,'2026-07-22T13:24:00Z','2026-07-22T14:23:00Z'),
 (5,13,'Ember & Ash','Smoky vegan chili loaded with mushrooms and black beans.',2,NULL,'active',NULL,'2026-07-22T14:24:00Z',1,'2026-07-22T13:26:00Z','2026-07-22T14:24:00Z'),
 (6,14,'Nashville Napalm','Hot chicken-inspired chili with cayenne and brown sugar.',5,NULL,'active',NULL,'2026-07-22T14:25:00Z',1,'2026-07-22T13:28:00Z','2026-07-22T14:25:00Z'),
 (7,15,'Campfire Classic','Mild beef and bean chili made for second bowls.',1,NULL,'active',NULL,'2026-07-22T14:26:00Z',1,'2026-07-22T13:30:00Z','2026-07-22T14:26:00Z'),
 (8,16,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,'2026-07-22T13:32:00Z','2026-07-22T13:32:00Z'),
 (9,17,'Mildly Concerned','A gentle tomato-forward turkey chili. The cook did not arrive.',1,NULL,'inactive','Contestant has not checked in.',NULL,NULL,'2026-07-22T13:34:00Z','2026-07-22T14:40:00Z');

INSERT INTO chili_tags (chili_id,tag_id) VALUES
 (1,3),(1,4),(2,1),(2,3),(2,4),(4,3),(5,1),(5,2),(5,3),(5,4),(6,4),(7,6),(9,6);

INSERT INTO chili_votes (user_id,chili_id,idempotency_key,created_at) VALUES
 (2,1,'seed-v001','2026-07-22T14:31:00Z'),(2,1,'seed-v002','2026-07-22T14:32:00Z'),(2,2,'seed-v003','2026-07-22T14:33:00Z'),
 (3,1,'seed-v004','2026-07-22T14:34:00Z'),(4,1,'seed-v005','2026-07-22T14:35:00Z'),(4,2,'seed-v006','2026-07-22T14:36:00Z'),(4,3,'seed-v007','2026-07-22T14:37:00Z'),(4,4,'seed-v008','2026-07-22T14:38:00Z'),
 (5,1,'seed-v009','2026-07-22T14:39:00Z'),(5,2,'seed-v010','2026-07-22T14:40:00Z'),
 (6,1,'seed-v011','2026-07-22T14:41:00Z'),(6,1,'seed-v012','2026-07-22T14:42:00Z'),(6,2,'seed-v013','2026-07-22T14:43:00Z'),(6,3,'seed-v014','2026-07-22T14:44:00Z'),(6,4,'seed-v015','2026-07-22T14:45:00Z'),
 (7,2,'seed-v016','2026-07-22T14:46:00Z'),
 (8,1,'seed-v017','2026-07-22T14:47:00Z'),(8,2,'seed-v018','2026-07-22T14:48:00Z'),(8,3,'seed-v019','2026-07-22T14:49:00Z'),
 (9,1,'seed-v020','2026-07-22T14:50:00Z'),(9,2,'seed-v021','2026-07-22T14:51:00Z'),
 (10,1,'seed-v022','2026-07-22T14:52:00Z'),(10,3,'seed-v023','2026-07-22T14:53:00Z'),
 (11,2,'seed-v024','2026-07-22T14:54:00Z'),
 (12,1,'seed-v025','2026-07-22T14:55:00Z'),(12,3,'seed-v026','2026-07-22T14:56:00Z'),(12,4,'seed-v027','2026-07-22T14:57:00Z'),
 (13,2,'seed-v028','2026-07-22T14:58:00Z'),(13,5,'seed-v029','2026-07-22T14:59:00Z'),
 (14,3,'seed-v030','2026-07-22T15:00:00Z'),
 (15,4,'seed-v031','2026-07-22T15:01:00Z'),(15,5,'seed-v032','2026-07-22T15:02:00Z'),
 (18,4,'seed-v033','2026-07-22T15:03:00Z'),(18,2,'seed-v034','2026-07-22T15:04:00Z'),(18,3,'seed-v035','2026-07-22T15:05:00Z'),(18,4,'seed-v036','2026-07-22T15:06:00Z'),
 (20,5,'seed-v037','2026-07-22T15:07:00Z'),(20,3,'seed-v038','2026-07-22T15:08:00Z'),(20,5,'seed-v039','2026-07-22T15:09:00Z'),
 (21,6,'seed-v040','2026-07-22T15:10:00Z');

UPDATE users
SET available_vote_count = issued_vote_count - (SELECT COUNT(*) FROM chili_votes WHERE chili_votes.user_id=users.id)
WHERE id > 1;

INSERT INTO pledges (id,user_id,recorded_by_user_id,context,amount_cents,additional_vote_count,corrects_pledge_id,reason,created_at) VALUES
 (1,2,NULL,'initial',4500,0,NULL,NULL,'2026-07-22T13:07:00Z'),(2,2,NULL,'additional_votes',2000,2,NULL,NULL,'2026-07-22T14:29:00Z'),
 (3,3,NULL,'initial',4000,0,NULL,NULL,'2026-07-22T13:08:00Z'),(4,4,NULL,'initial',3500,0,NULL,NULL,'2026-07-22T13:10:00Z'),
 (5,5,NULL,'initial',2500,0,NULL,NULL,'2026-07-22T13:12:00Z'),(6,6,NULL,'initial',5000,0,NULL,NULL,'2026-07-22T13:14:00Z'),
 (7,7,NULL,'initial',1500,0,NULL,NULL,'2026-07-22T13:16:00Z'),(8,8,NULL,'initial',3000,0,NULL,NULL,'2026-07-22T13:18:00Z'),
 (9,9,NULL,'initial',2000,0,NULL,NULL,'2026-07-22T13:20:00Z'),(10,10,NULL,'initial',4000,0,NULL,NULL,'2026-07-22T13:22:00Z'),
 (11,11,NULL,'initial',2500,0,NULL,NULL,'2026-07-22T13:24:00Z'),(12,12,NULL,'initial',4500,0,NULL,NULL,'2026-07-22T13:26:00Z'),
 (13,13,NULL,'initial',3000,0,NULL,NULL,'2026-07-22T13:28:00Z'),(14,14,NULL,'initial',2500,0,NULL,NULL,'2026-07-22T13:30:00Z'),
 (15,15,NULL,'initial',3500,0,NULL,NULL,'2026-07-22T13:32:00Z'),(16,16,NULL,'initial',2500,0,NULL,NULL,'2026-07-22T13:34:00Z'),
 (17,17,NULL,'initial',2000,0,NULL,NULL,'2026-07-22T13:36:00Z'),(18,18,NULL,'initial',5000,0,NULL,NULL,'2026-07-22T13:38:00Z'),
 (19,19,NULL,'initial',0,0,NULL,NULL,'2026-07-22T13:40:00Z'),(20,20,NULL,'initial',3000,0,NULL,NULL,'2026-07-22T13:42:00Z'),
 (21,21,NULL,'initial',2500,0,NULL,NULL,'2026-07-22T13:44:00Z'),(22,22,NULL,'initial',1500,0,NULL,NULL,'2026-07-22T13:46:00Z'),
 (23,23,NULL,'initial',2500,0,NULL,NULL,'2026-07-22T13:48:00Z'),(24,24,NULL,'initial',3500,0,NULL,NULL,'2026-07-22T13:50:00Z'),
 (25,25,1,'admin',1000,0,NULL,'Cash pledge recorded at check-in.','2026-07-22T14:38:00Z'),
 (26,20,1,'admin',25000,0,NULL,'Mistaken extra zero.','2026-07-22T14:42:00Z'),
 (27,20,1,'reversal',-25000,0,26,'Reverse mistaken pledge.','2026-07-22T14:43:00Z'),
 (28,20,1,'correction',2500,0,26,'Correct pledge amount.','2026-07-22T14:44:00Z'),
 (29,18,NULL,'initial',11000,0,NULL,'Generous event-night pledge.','2026-07-22T14:46:00Z');

INSERT INTO vote_adjustments (user_id,delta,reason,adjusted_by_user_id,created_at) VALUES
 (23,1,'Replacement ballot after a phone error.',1,'2026-07-22T14:50:00Z');
UPDATE users SET issued_vote_count=issued_vote_count+1,available_vote_count=available_vote_count+1 WHERE id=23;

INSERT INTO audit_entries (actor_user_id,action,entity_type,entity_id,reason,before_json,after_json,created_at) VALUES
 (1,'event.voting_opened','event',1,NULL,'{"votingIsOpen":false}','{"votingIsOpen":true}','2026-07-22T14:00:00Z'),
 (1,'attendee.checked_in','user',2,NULL,'{"checkedInAt":null}','{"checkedInAt":"2026-07-22T14:01:00Z"}','2026-07-22T14:01:00Z'),
 (1,'attendee.checked_in','user',3,NULL,'{"checkedInAt":null}','{"checkedInAt":"2026-07-22T14:02:00Z"}','2026-07-22T14:02:00Z'),
 (1,'chili.activated','chili',1,NULL,'{"status":"draft"}','{"status":"active"}','2026-07-22T14:20:00Z'),
 (1,'chili.activated','chili',2,NULL,'{"status":"draft"}','{"status":"active"}','2026-07-22T14:21:00Z'),
 (1,'chili.deactivated','chili',9,'Contestant has not checked in.','{"status":"active"}','{"status":"inactive"}','2026-07-22T14:40:00Z'),
 (1,'pledge.reversed','pledge',26,'Mistaken extra zero.',NULL,'{"reversalPledgeId":27}','2026-07-22T14:43:00Z'),
 (1,'votes.adjusted','user',23,'Replacement ballot after a phone error.','{"availableVoteCount":2}','{"availableVoteCount":3}','2026-07-22T14:50:00Z'),
 (1,'participation.disabled','user',25,'Duplicate prank account',NULL,'{"participationDisabledAt":"2026-07-22T15:00:00Z"}','2026-07-22T15:00:00Z');

DROP TABLE _reset_identities;
COMMIT;
PRAGMA foreign_keys = ON;
