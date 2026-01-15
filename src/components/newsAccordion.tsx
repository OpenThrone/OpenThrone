import { Text } from '@mantine/core';
import Link from 'next/link';
import type { KeyboardEvent } from 'react';
import React, { useState } from 'react';

import ContentCard from './ContentCard';

const NewsAccordion = ({ news = [] }) => {
  const [isOpen, setIsOpen] = useState(Array(news.length).fill(false));

  const toggleAccordion = (index: number) => {
    const newState = [...isOpen];
    newState[index] = !newState[index];
    setIsOpen(newState);
  };

  const onKeyToggle = (e: KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleAccordion(index);
    }
  };

  const formatDate = (ts) => {
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
      return '';
    }
  };

  // filter out invalid items (protect against strings or malformed input)
  const items = Array.isArray(news)
    ? news.filter(
        (it) => it && typeof it === 'object' && ('id' in it || 'title' in it),
      )
    : [];

  return (
    <>
      {/* Mobile / stacked view */}
      <div className="block sm:hidden">
        {items.map((item, index) => (
          <ContentCard
            key={item.id ?? index}
            variant={isOpen[index] ? 'highlight' : 'default'}
            title={item.title}
            titleSize={isOpen[index] ? 'md' : 'sm'}
            actions={
              <div className="flex items-center gap-2">
                {/* Read/unread indicator if provided */}
                {item.read === false && (
                  <span
                    className="inline-block size-2 rounded-full bg-yellow-400"
                    aria-hidden
                  />
                )}
                <button
                  onClick={() => toggleAccordion(index)}
                  onKeyDown={(e) => onKeyToggle(e, index)}
                  aria-expanded={isOpen[index]}
                  aria-controls={`news-content-${item.id}`}
                  className="rounded px-2 py-1 text-sm text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  {isOpen[index] ? 'Collapse' : 'Expand'}
                </button>
              </div>
            }
            className="my-2"
          >
            <div>
              <Text size="xs" color="dimmed">
                {formatDate(item.created_timestamp)}
              </Text>
              <div id={`news-content-${item.id}`} className="mt-2">
                {isOpen[index] ? (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-gray-300">
                      {item.content}
                    </p>
                    <div className="mt-2">
                      <Link
                        href={`/community/news/${item.id}`}
                        className="text-yellow-400 hover:underline"
                      >
                        Read full post
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    {(item.content || '').substring(0, 200)}
                    {(item.content || '').length > 200 ? '...' : ''}
                  </p>
                )}
              </div>
            </div>
          </ContentCard>
        ))}
      </div>

      {/* Desktop / table view */}
      <div className=" sm:block">
        <table className="my-4 w-full table-auto divide-y divide-gray-200 text-white">
          <thead>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
              >
                Title
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
              >
                Date
              </th>
              <th scope="col" className="relative hidden px-6 py-3 md:block">
                <span className="sr-only">Expand</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item, index) => (
              <React.Fragment key={item.id ?? index}>
                <tr
                  key={`row-${item.id ?? index}`}
                  className="odd:bg-table-odd even:bg-table-even"
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                    <div className="flex items-center gap-3">
                      {item.read === false && (
                        <span
                          className="inline-block size-2 rounded-full bg-yellow-400"
                          aria-hidden
                        />
                      )}
                      <span>{item.title}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    {formatDate(item.created_timestamp)}
                  </td>
                  <td className="hidden whitespace-nowrap px-6 py-4 text-right text-sm font-medium md:block">
                    <button
                      onClick={() => toggleAccordion(index)}
                      onKeyDown={(e) => onKeyToggle(e as any, index)}
                      aria-expanded={isOpen[index]}
                      aria-controls={`news-content-${item.id}`}
                      className="rounded px-2 py-1 text-sm text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    >
                      {isOpen[index] ? 'Collapse' : 'Expand'}
                    </button>
                  </td>
                </tr>

                {isOpen[index] && (
                  <tr
                    key={`detail-${item.id ?? index}`}
                    className="odd:bg-table-odd even:bg-table-even"
                  >
                    <td colSpan={3} className="px-6 py-4">
                      <div
                        id={`news-content-${item.id ?? index}`}
                        className="whitespace-pre-wrap text-sm text-gray-300"
                      >
                        {item.content}
                      </div>
                      <div className="mt-2">
                        <Link
                          href={`/community/news/${item.id ?? ''}`}
                          className="text-yellow-400 hover:underline"
                        >
                          Read full post
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default NewsAccordion;
