-- Seed the board with the initial 8 placeholder posts.
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor) after creating the board_posts table.
-- Requires: board_posts table and RLS policies in place.

insert into board_posts (image_url, mood, caption, author, avatar_color, reactions) values
(
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop',
  'caffeinated',
  'Double oat latte and a Figma file. The usual.',
  'Ari M.',
  '#b7410e',
  '{"❤️": 4, "🎉": 1}'::jsonb
),
(
  'https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=400&h=300&fit=crop',
  'golden hour',
  'Presidio lawn. Laptop battery at 34%. No regrets.',
  'Jun T.',
  '#c9943e',
  '{"🎉": 3, "😂": 2}'::jsonb
),
(
  'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=400&h=300&fit=crop',
  'cozy',
  'Cat claimed the warm spot next to my laptop. Again.',
  'Priya K.',
  '#4e7e8f',
  '{"❤️": 7, "👍": 2, "😂": 3}'::jsonb
),
(
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&h=300&fit=crop',
  'in transit',
  'SFO terminal wifi holding strong. Reviewing PRs before boarding.',
  'Devon R.',
  '#3a6078',
  '{"👍": 3}'::jsonb
),
(
  'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&h=300&fit=crop',
  'focused',
  'Standing desk, noise-canceling on, deep work mode.',
  'Sam L.',
  '#3a6e52',
  '{"👍": 5, "❤️": 1}'::jsonb
),
(
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop',
  'lazy day',
  'Blanket burrito + async standup. This is the way.',
  'Mel W.',
  '#5a7e7a',
  '{"😂": 4, "❤️": 2}'::jsonb
),
(
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=300&fit=crop',
  'buzzing',
  'New co-working spot in Hayes Valley. The energy is real.',
  'Alex C.',
  '#2e7d7e',
  '{"🎉": 2, "👍": 1}'::jsonb
),
(
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&h=300&fit=crop',
  'living the dream',
  'Hammock, hotspot, and a Notion doc. Peak remote.',
  'Rio S.',
  '#4a8fa0',
  '{"❤️": 6, "🎉": 4, "👍": 2}'::jsonb
);
