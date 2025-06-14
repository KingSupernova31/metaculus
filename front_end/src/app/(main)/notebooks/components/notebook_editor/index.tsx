"use client";

import "./editor.css";

import { Field, Input, Label } from "@headlessui/react";
import { ApiError } from "next/dist/server/api-utils";
import { useLocale, useTranslations } from "next-intl";
import React, { useEffect, useState, useRef } from "react";

import { updateNotebook } from "@/app/(main)/questions/actions";
import MarkdownEditor from "@/components/markdown_editor";
import PostDefaultProject from "@/components/post_default_project";
import Button from "@/components/ui/button";
import { useContentTranslatedBannerContext } from "@/contexts/translations_banner_context";
import { PostStatus, NotebookPost, ProjectPermissions } from "@/types/post";

interface NotebookEditorProps {
  postData: NotebookPost;
  contentId?: string;
}

const NotebookEditor: React.FC<NotebookEditorProps> = ({
  postData,
  contentId,
}) => {
  const t = useTranslations();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState(postData.title);
  const [markdown, setMarkdown] = useState(postData.notebook.markdown);

  const allowModifications =
    [ProjectPermissions.ADMIN, ProjectPermissions.CURATOR].includes(
      postData.user_permission
    ) ||
    (postData.user_permission === ProjectPermissions.CREATOR &&
      postData.curation_status !== PostStatus.APPROVED);

  const toggleEditMode = async () => {
    if (isEditing) {
      try {
        setError(null);
        await updateNotebook(postData.id, markdown, title);
      } catch (error) {
        const errorData = error as ApiError;
        setError(errorData.message);
      }
    }

    setIsEditing((prev) => !prev);
  };

  const { setBannerIsVisible } = useContentTranslatedBannerContext();
  const locale = useLocale();

  useEffect(() => {
    if (postData.is_current_content_translated) {
      setBannerIsVisible(true);
    }
  }, [postData, locale]);

  // Handle hash anchor scrolling after content is rendered
  useEffect(() => {
    if (!isEditing && window.location.hash && contentRef.current) {
      const targetHash = window.location.hash;

      const scrollToHash = () => {
        setTimeout(() => {
          const element = document.querySelector(targetHash);
          if (element) {
            element.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        }, 1500);
      };

      const observer = new MutationObserver((mutations) => {
        // Check if any mutations added new elements
        const hasNewElements = mutations.some(
          (mutation) =>
            mutation.type === "childList" && mutation.addedNodes.length > 0
        );

        if (hasNewElements) {
          scrollToHash();
          observer.disconnect();
        }
      });

      // Start observing the markdown change container
      // Assuming it finishes rendering when it's changed
      observer.observe(contentRef.current, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();
      }, 10000);

      return () => {
        observer.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [isEditing, markdown]);

  const defaultProject = postData.projects.default_project;
  return (
    <div>
      <div className="flex">
        <PostDefaultProject defaultProject={defaultProject} />
        {allowModifications && (
          <Button className="ml-auto p-2" onClick={toggleEditMode}>
            {isEditing ? "save" : "edit"}
          </Button>
        )}
      </div>

      {error && (
        <div className="text-red-500 dark:text-red-500-dark">{error}</div>
      )}

      {isEditing && (
        <div className="flex flex-col">
          <Field className="my-2 flex items-center gap-1">
            <Label>{t("Title")}</Label>
            <Input
              name="title"
              type="text"
              className="w-full max-w-[600px] rounded-sm border border-blue-500 p-1 dark:border-blue-500-dark"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <MarkdownEditor
            mode="write"
            markdown={markdown}
            onChange={setMarkdown}
          />
        </div>
      )}

      {!isEditing && (
        <div id={contentId} ref={contentRef}>
          <MarkdownEditor mode="read" markdown={markdown} withTwitterPreview />
        </div>
      )}
    </div>
  );
};

export default NotebookEditor;
