import { useState } from 'react';

import BlogPost from '@/components/blogPost';
import { StyledNews } from '@/components/game/StyledNews';
import MarkdownArticle from '@/components/news/MarkdownArticle';
import type { BlogPostDTO } from '@/services/Blog.service';

import { mockAction, ShowcaseSection, Specimen } from '../Showcase';

type StyledNewsItems = Parameters<typeof StyledNews>[0]['news'];

const MOCK_DISPATCHES: StyledNewsItems = [
  {
    id: 301,
    title: 'Era of Embers begins',
    content:
      'The new era opens **today at noon**. All warlords begin with fresh lands and a week of protection.',
    created_timestamp: '2026-10-18T12:00:00.000Z',
    read: false,
    kind: 'NEWS',
  },
  {
    id: 302,
    title: 'Changelog 0.6.0: armory planner and alliance lists',
    content:
      '## New\n- Loadout planner in the armory\n- Farm, Hit and Block lists for alliances\n\n## Fixed\n- Bank history paging',
    created_timestamp: '2026-10-15T09:30:00.000Z',
    read: true,
    kind: 'CHANGELOG',
  },
  {
    id: 303,
    title: 'Rules of the realm (read before attacking)',
    content:
      'Multi-accounting and scripted play are forbidden. Report exploits to the moderators.',
    created_timestamp: '2026-09-01T08:00:00.000Z',
    read: true,
    kind: 'NEWS',
    isPinned: true,
  },
  {
    id: 304,
    title: "A goblin's guide to fort repair",
    content:
      'Patch the walls *before* the raid, not after. Fort hit points recover slowly without gold.',
    created_timestamp: '2026-10-10T17:45:00.000Z',
    read: false,
    kind: 'BLOG',
  },
];

const ARTICLE_MARKDOWN = `# The siege of Blackmere

A chronicle of the third night, as told by the **Silver Vigil**.

## Forces at the walls

1. Four hundred offense units of the Ashen Court
2. Two warbands of goblin raiders
3. One very lost courier

- Sentries held the east gate
- Spies reported early and *often*
- [Read the alliance rules](/community/news/303)

> The walls stood because the citizens stood behind them.
> — Elowen Starbough

### Casualties

| Side | Units lost | Gold pillaged |
| --- | ---: | ---: |
| Silver Vigil | 196 | 3,904,000 |
| Ashen Court | 58 | 0 |

Inline \`code\` for battle ids such as \`#9004\`, and a horizontal rule:

---

*Filed by the royal scribe.*`;

const MOCK_POST: BlogPostDTO & { image?: string; tags?: string[] } = {
  id: 305,
  title: 'War council: preparing for the Era of Embers',
  content: `The new era is close. Here is what every warlord should do in the **first week**.

## Before the gates open

- Bank your starting gold
- Train sentries before offense
- Join or found an alliance

> Protection ends sooner than you expect.

See the [battle guide](/community/news/302) for unit costs.`,
  postedby_id: 1,
  authorName: 'The Royal Herald',
  created_timestamp: '2026-10-17T10:00:00.000Z',
  isRead: false,
  kind: 'BLOG',
  isPinned: true,
  image: '/assets/images/ui/public/war-table.webp',
  tags: ['strategy', 'new era', 'alliances'],
};

function BlogPostDemo() {
  const [isRead, setIsRead] = useState(MOCK_POST.isRead);
  return (
    <BlogPost
      post={{ ...MOCK_POST, isRead }}
      loggedIn
      handleReadChange={(id) => {
        setIsRead((value) => !value);
        mockAction(`toggle read state of post ${id}`)();
      }}
    />
  );
}

export default function NewsSection() {
  return (
    <ShowcaseSection
      id="news"
      title="News & articles"
      description="Dispatches, blog posts and the shared markdown renderer, fed with mock posts."
    >
      <Specimen
        framed={false}
        name="StyledNews"
        usedOn={['/home/overview']}
        note="Pinned item sorts first; the first unread item opens by default. Bodies render through MarkdownArticle (compact variant), so headings keep their levels. 'Read full' links go to the real news pages."
      >
        <StyledNews news={MOCK_DISPATCHES} />
      </Specimen>

      <Specimen
        framed={false}
        name="StyledNews (empty)"
        usedOn={['/home/overview']}
      >
        <StyledNews news={[]} />
      </Specimen>

      <Specimen
        framed={false}
        name="BlogPost"
        usedOn={['/community/news', '/community/news/[id]']}
        note="Read toggle is local. The share button uses the browser share sheet or clipboard (no server call)."
        wide
      >
        <BlogPostDemo />
      </Specimen>

      <Specimen
        name="MarkdownArticle"
        usedOn={['/community/news/[id]', '/community/news (composer preview)']}
        wide
      >
        <MarkdownArticle content={ARTICLE_MARKDOWN} />
      </Specimen>
    </ShowcaseSection>
  );
}
