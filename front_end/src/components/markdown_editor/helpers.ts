import { sanitizeHtmlContent } from "@/utils/markdown";

import { EMBEDDED_QUESTION_COMPONENT_NAME } from "./embedded_question";
import { EMBEDDED_TWITTER_COMPONENT_NAME } from "./embedded_twitter";
import { transformTwitterLinks } from "./embedded_twitter/helpers";

// match block math: $$...$$
const BLOCK_MATH_REGEX = /(?<!\\)\$\$(?:[^$]|\\\$)*?\$\$/g;
// match valid inline math: $...$ that starts and ends with a non-word character
const INLINE_MATH_REGEX = /(?<!\\)(?<!\w|\d)\$([^\$]+?)\$(?!\w|\d)/gs;

// escape < and { that is not correctly used
function escapePlainTextSymbols(str: string) {
  // pre-process html tags
  const tags: string[] = [];
  const tagRegex = /<\/?\s*[a-zA-Z][a-zA-Z0-9-]*(?:\s+[^<>]*?)?>/g;
  let tempStr = str.replace(tagRegex, function (match) {
    tags.push(match);
    return "___HTML_TAG___";
  });

  // pre-process math expressions
  const mathExpressions: string[] = [];
  tempStr = tempStr.replace(BLOCK_MATH_REGEX, function (match) {
    mathExpressions.push(match);
    return "___MATH_BLOCK___";
  });
  tempStr = tempStr.replace(INLINE_MATH_REGEX, function (match) {
    mathExpressions.push(match);
    return "___MATH_INLINE___";
  });

  // escape < that is not correctly used
  tempStr = tempStr.replace(/([^\\])</g, "$1\\<").replace(/^</g, "\\<");

  // restore math expressions
  let mathIndex = 0;
  tempStr = tempStr.replace(/___MATH_(BLOCK|INLINE)___/g, function () {
    return mathExpressions[mathIndex++] ?? "";
  });

  // restore html tags
  let tagIndex = 0;
  tempStr = tempStr.replace(/___HTML_TAG___/g, function () {
    return tags[tagIndex++] ?? "";
  });

  // escape { that is not correctly used
  tempStr = tempStr
    .replace(/([^{]){(?![^}]*})/g, "$1\\{")
    .replace(/^{(?![^}]*})/g, "\\{");

  return tempStr;
}

function formatBlockquoteNewlines(markdown: string): string {
  return markdown.replace(/>\s*\n/g, "> \u00A0\n");
}

// backwards compatibility util to handle the old mathjax syntax
const transformMathJaxToLatex = (markdown: string): string => {
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  // remove non-breaking spaces
  // syntax trigger for block math must start from new line
  markdown = markdown.replace(/\u00A0/g, " ");

  // Temporary replacements for links to avoid interfering with MathJax processing
  const links: string[] = [];
  markdown = markdown.replace(markdownLinkPattern, (match) => {
    links.push(match);
    return `__LINK_PLACEHOLDER_${links.length - 1}__`;
  });

  // convert MathJax expressions to markdown math syntax
  // \[ and \] are used for block math, \( and \) are used for inline math
  const simpleMathJaxExpression = /\\([\(\[])(.*?)(\\[\)\]])/gs;
  markdown = markdown.replace(simpleMathJaxExpression, (_match, p1, p2, p3) => {
    if (p1.includes("(") && p3.includes(")")) {
      return `$${p2}$`;
    }

    return `$$\n${p2}\n$$`;
  });

  // convert complex MathJax expressions to markdown math syntax
  // basically, wrap math expression in block syntax ($$ ... $$)
  const complexMathJaxExpression =
    /(?:^\$\$\n)?\\begin{([^}]*)}(.*?)\\end{([^}]*)}(?:\n\$\$$)?/gs;
  markdown = markdown.replace(
    complexMathJaxExpression,
    (_match, p1, p2, p3, offset, original) => {
      let content = `\\begin{${p1}}${p2}\\end{${p3}}`;

      const startsWithWrap = original.slice(offset - 3, offset) === "$$\n";
      const endsWithWrap =
        original.slice(offset + _match.length, offset + _match.length + 3) ===
        "\n$$";

      if (!startsWithWrap) {
        content = `$$\n${content}`;
      }
      if (!endsWithWrap) {
        content = `${content}\n$$`;
      }

      return content;
    }
  );

  // Restore the links
  markdown = markdown.replace(
    /__LINK_PLACEHOLDER_(\d+)__/g,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (_match, index) => links[index]!
  );

  return markdown;
};

// escape dollar signs that are not used for math
export const escapeRawDollarSigns = (markdown: string): string => {
  const placeholders = new Map<string, string>();
  let placeholderIndex = 0;

  // replace block math with placeholders and ensure newlines are added
  let processedMarkdown = markdown.replace(BLOCK_MATH_REGEX, (blockMath) => {
    const trimmedMath = blockMath.trim();
    const formattedMath = `\n${trimmedMath}\n`;
    const placeholder = `{{MATH_BLOCK_${placeholderIndex++}}}`;
    placeholders.set(placeholder, formattedMath);
    return placeholder;
  });

  // replace valid inline math with placeholders
  processedMarkdown = processedMarkdown.replace(INLINE_MATH_REGEX, (match) => {
    const placeholder = `{{MATH_INLINE_${placeholderIndex++}}}`;
    placeholders.set(placeholder, match); // Save the valid inline math as is
    return placeholder;
  });

  // escape remaining dollar signs that are not part of valid math
  processedMarkdown = processedMarkdown.replace(/(?<!\\)\$/g, "\\$");

  // restore all placeholders (block math and inline math)
  return processedMarkdown.replace(
    /{{MATH_(BLOCK|INLINE)_\d+}}/g,
    (placeholder) => placeholders.get(placeholder) || placeholder
  );
};

const preProcessMarkdownContent = (
  markdown: string,
  {
    search,
    placeholderName,
  }: { search: string | RegExp; placeholderName: string }
) => {
  const placeholders: {
    placeholder: string;
    original: string;
  }[] = [];

  let placeholderId = 0;
  markdown = markdown.replace(search, (match) => {
    const placeholder = `___${placeholderName}_${placeholderId++}___`;
    placeholders.push({ placeholder, original: match });
    return placeholder;
  });

  return { markdown, placeholders };
};

function sanitizeHtml(markdown: string) {
  // pre-process embedded JSX as otherwise it will be removed by DOMPurify
  const supportedComponents = [
    EMBEDDED_QUESTION_COMPONENT_NAME,
    EMBEDDED_TWITTER_COMPONENT_NAME,
  ];
  const componentPatternString = supportedComponents.join("|");
  const jsxComponentRegex = new RegExp(
    `<(${componentPatternString})\\s+([^>]*)\\s*(?:\\/>|>(.*?)<\\/\\1>)`,
    "gs"
  );
  const { markdown: jsxProcessedMarkdown, placeholders: jsxComponents } =
    preProcessMarkdownContent(markdown, {
      search: jsxComponentRegex,
      placeholderName: "JSX_COMPONENT",
    });
  markdown = jsxProcessedMarkdown;

  // pre-process self-closing tags as otherwise DOMPurify will remove or mess them up by converting to HTML5 syntax
  // also MDXEditor renderer expects images to have self-closing syntax
  const defaultSelfClosingTags = ["hr", "br", "img"];
  const selfClosingTagsPattern = defaultSelfClosingTags.join("|");
  const selfClosingTagsRegex = new RegExp(
    `<(${selfClosingTagsPattern})\\s+([^>]*)\\s*(?:\\/>|>(.*?)<\\/\\1>)`,
    "gs"
  );
  const {
    markdown: selfClosingProcessedMarkdown,
    placeholders: selfClosingTags,
  } = preProcessMarkdownContent(markdown, {
    search: selfClosingTagsRegex,
    placeholderName: "SELF_CLOSING_TAG",
  });
  markdown = selfClosingProcessedMarkdown;

  // sanitize html content
  markdown = sanitizeHtmlContent(markdown);

  // restore JSX components
  jsxComponents.forEach(({ placeholder, original }) => {
    markdown = markdown.replace(placeholder, original);
  });
  // restore native self-closing tags
  selfClosingTags.forEach(({ placeholder, original }) => {
    // ensure self-closing syntax
    let nativeTag = original;
    if (!nativeTag.endsWith("/>") && !nativeTag.endsWith("/ >")) {
      nativeTag = nativeTag.replace(/>$/, " />");
    }
    markdown = markdown.replace(placeholder, nativeTag);
  });

  // decode gt and lt to < and >, so MDXEditor can render it properly
  markdown = markdown.replace(/&lt;/g, "<");
  markdown = markdown.replace(/&gt;/g, ">");

  return markdown;
}

export function processMarkdown(
  markdown: string,
  config?: { revert?: boolean; withTwitterPreview?: boolean }
): string {
  const { revert, withTwitterPreview } = config ?? {};
  markdown = formatBlockquoteNewlines(markdown);
  if (!revert) {
    markdown = transformMathJaxToLatex(markdown);
    markdown = escapeRawDollarSigns(markdown);
  }
  markdown = escapePlainTextSymbols(markdown);
  if (withTwitterPreview) {
    markdown = transformTwitterLinks(markdown);
  }

  markdown = sanitizeHtml(markdown);

  return markdown;
}
