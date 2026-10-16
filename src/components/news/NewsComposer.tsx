import {
  faEye,
  faPenToSquare,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Input,
  Paper,
  SegmentedControl,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { useId, useState } from 'react';

import frameClasses from '@/components/game/FantasyFrame.module.css';
import MarkdownArticle from '@/components/news/MarkdownArticle';
import classes from '@/components/public/PublicPages.module.css';

export interface NewsDraft {
  title: string;
  content: string;
}

interface NewsComposerProps {
  /** Draft lives in the page so collapsing the composer keeps the work. */
  draft: NewsDraft;
  onDraftChange: (draft: NewsDraft) => void;
  isSubmitting: boolean;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}

const EMPTY_DRAFT: NewsDraft = { title: '', content: '' };

/**
 * Inline composer rendered in the news page flow instead of a modal: larger
 * editing surface, live preview, no focus trap or background scroll lock.
 */
const NewsComposer = ({
  draft,
  onDraftChange,
  isSubmitting,
  error,
  onSubmit,
  onClose,
}: NewsComposerProps) => {
  const { t } = useTranslation('community');
  const isNarrow = useMediaQuery('(max-width: 900px)');
  const [view, setView] = useState<'write' | 'preview'>('write');
  const hintId = useId();

  const canSubmit =
    draft.title.trim().length > 0 && draft.content.trim().length > 0;
  const isDirty =
    draft.title !== EMPTY_DRAFT.title || draft.content !== EMPTY_DRAFT.content;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit && !isSubmitting) onSubmit();
  };

  // Below the two-pane breakpoint a segmented control swaps the panes instead.
  const showWrite = !isNarrow || view === 'write';
  const showPreview = !isNarrow || view === 'preview';

  return (
    <Paper
      component="section"
      aria-label={t('news.composerLabel')}
      className={`${classes.newsComposer} ${frameClasses.surface} ${frameClasses.ornate}`}
    >
      <Box className={classes.composerHeader}>
        <Title order={2} className={classes.sectionTitle}>
          {t('news.composeTitle')}
        </Title>
        <Group gap="xs" wrap="nowrap">
          {isNarrow && (
            <SegmentedControl
              size="xs"
              value={view}
              onChange={(value) =>
                setView(value === 'preview' ? 'preview' : 'write')
              }
              aria-label={t('news.composerViewLabel')}
              data={[
                {
                  value: 'write',
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <FontAwesomeIcon icon={faPenToSquare} />
                      <Text size="xs">{t('news.writeTab')}</Text>
                    </Group>
                  ),
                },
                {
                  value: 'preview',
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <FontAwesomeIcon icon={faEye} />
                      <Text size="xs">{t('news.previewTab')}</Text>
                    </Group>
                  ),
                },
              ]}
            />
          )}
          <ActionIcon
            variant="outline"
            color="gray"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={t('news.closeComposer')}
          >
            <FontAwesomeIcon icon={faXmark} />
          </ActionIcon>
        </Group>
      </Box>

      {error && (
        <Alert color="red" role="alert" mb="md">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <TextInput
          label={t('news.fieldTitle')}
          value={draft.title}
          onChange={(event) =>
            onDraftChange({ ...draft, title: event.currentTarget.value })
          }
          placeholder={t('news.titlePlaceholder')}
          required
          maxLength={200}
          autoFocus
        />

        <div className={classes.composerGrid}>
          {showWrite && (
            <div className={classes.composerPane}>
              <Textarea
                label={t('news.content')}
                value={draft.content}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    content: event.currentTarget.value,
                  })
                }
                placeholder={t('news.contentPlaceholder')}
                aria-describedby={hintId}
                required
                autosize
                minRows={14}
                maxRows={26}
                classNames={{ input: classes.composerInput }}
              />
              <Text id={hintId} className={classes.composerHint}>
                {`${t('news.markdownHint')} ${t('news.draftRetained')}`}
              </Text>
            </div>
          )}

          {showPreview && (
            <div className={classes.composerPane}>
              <Input.Wrapper label={t('news.previewLabel')}>
                <Paper className={classes.composerPreview} aria-live="polite">
                  {isDirty ? (
                    <>
                      <Title order={3} className={classes.composerPreviewTitle}>
                        {draft.title || t('news.untitledPreview')}
                      </Title>
                      <MarkdownArticle content={draft.content} />
                    </>
                  ) : (
                    <Text size="sm" c="var(--ot-muted)">
                      {t('news.previewEmpty')}
                    </Text>
                  )}
                </Paper>
              </Input.Wrapper>
            </div>
          )}
        </div>

        <Group mt="lg" justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('news.cancel')}
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={!canSubmit || isSubmitting}
          >
            {t('news.submit')}
          </Button>
        </Group>
      </form>
    </Paper>
  );
};

export default NewsComposer;
