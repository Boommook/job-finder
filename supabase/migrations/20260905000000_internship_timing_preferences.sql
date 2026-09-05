alter table public.job_preferences
  add column internship_season text not null default 'any'
    check (internship_season in ('any', 'summer', 'fall', 'spring', 'winter')),
  add column internship_year integer
    check (internship_year between 2000 and 2100);
