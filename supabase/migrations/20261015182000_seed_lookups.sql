-- Startdata til opslagslister. Kan udvides af ejeren i Opslagslister.
insert into public.level (code, name, sort_order, is_system) values
 ('owner_top','Ejer/topledelse',1,true),('executive','Direktion',2,true),('manager','Chef',3,true),
 ('lead','Leder',4,true),('senior_specialist','Senior specialist',5,true),('employee','Medarbejder',6,true);

insert into public.job_function (code, name, sort_order, is_system) values
 ('leadership','Ledelse',1,true),('project_execution','Projekt og udførelse',2,true),('development','Udvikling',3,true),
 ('bid','Tilbud og bid',4,true),('technical_advisory','Teknik og rådgivning',5,true),
 ('procurement_client','Indkøb og bygherre',6,true),('other','Andet',7,true);

insert into public.acquaintance (code, name, sort_order, is_system) values
 ('knows_of','Kender af',1,true),('met','Mødt',2,true),('knows','Kender',3,true),
 ('knows_well','Kender godt',4,true),('close','Tæt relation',5,true);

insert into public.affiliation_type (code, name, sort_order, is_system) values
 ('employment','Ansættelse',1,true),('board','Bestyrelse',2,true),('advisory_board','Advisory board',3,true),
 ('ownership','Ejerskab',4,true),('association','Forening eller udvalg',5,false),('freelance','Selvstændig rådgiver',6,false);

insert into public.sector (code, name, sort_order, is_system) values
 ('public','Offentlig',1,true),('private','Privat',2,true),('housing','Almennyttig',3,true);

insert into public.group_role (code, name, sort_order, is_system) values
 ('member','Medlem',1,true),('parent','Moderselskab',2,true),('subsidiary','Datterselskab',3,true),
 ('sister','Søsterselskab',4,true),('jv','Joint venture',5,true),('unknown','Ukendt',6,true);

insert into public.person_link_type (code, name, sort_order, is_system) values
 ('colleague','Kollega',1,true),('former_colleague','Tidligere kollega',2,true),
 ('reports_to','Rapporterer til',3,true),('collaborator','Samarbejdspartner',4,true),('mentor','Mentor',5,true);

-- Foreløbig modenhedsskala. Skal afstemmes med Niels.
insert into public.stage (code, name, sort_order, is_system) values
 ('unknown','Ukendt',1,false),('known','Kendt',2,false),('dialogue','I dialog',3,false),
 ('active','Aktiv relation',4,false),('strategic','Strategisk',5,false);

insert into public.branch (code, name, sort_order, is_system) values
 ('contractor','Entreprenør',1,true),('client','Bygherre',2,true),('architect','Arkitekt',3,true),
 ('engineer','Ingeniør',4,true),('lawyer','Advokat',5,true);

insert into public.branch (parent_id, code, name, sort_order, is_system)
select p.id, v.code, v.name, v.ord, true
from (values
 ('contractor','general_contractor','Totalentreprenør',1),
 ('contractor','main_contractor','Hovedentreprenør',2),
 ('contractor','trade_contractor','Fagentreprenør',3),
 ('client','state','Stat',1),('client','region','Region',2),('client','municipality','Kommune',3),
 ('client','housing_assoc','Almen bolig',4),('client','investor','Investor og ejendomsselskab',5),
 ('client','pension','Pensionskasse',6),('client','foundation','Fond',7),('client','developer','Privat udvikler',8)
) as v(parent_code, code, name, ord)
join public.branch p on p.code = v.parent_code;

-- Postnumre: kun et udvalg. Fuld liste (ca. 1.100) med region og kommune indlæses senere.
insert into public.postcode (postal_code, city, municipality, region) values
 ('1050','København K','København','Region Hovedstaden'),
 ('1560','København V','København','Region Hovedstaden'),
 ('2100','København Ø','København','Region Hovedstaden'),
 ('2300','København S','København','Region Hovedstaden'),
 ('2800','Kongens Lyngby','Lyngby-Taarbæk','Region Hovedstaden'),
 ('4000','Roskilde','Roskilde','Region Sjælland'),
 ('5000','Odense C','Odense','Region Syddanmark'),
 ('6000','Kolding','Kolding','Region Syddanmark'),
 ('7100','Vejle','Vejle','Region Syddanmark'),
 ('8000','Aarhus C','Aarhus','Region Midtjylland'),
 ('8200','Aarhus N','Aarhus','Region Midtjylland'),
 ('9000','Aalborg','Aalborg','Region Nordjylland');
