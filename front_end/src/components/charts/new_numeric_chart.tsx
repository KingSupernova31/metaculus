"use client";
import { isNil, merge } from "lodash";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CursorCoordinatesPropType,
  DomainTuple,
  LineSegment,
  VictoryArea,
  VictoryChart,
  VictoryContainer,
  VictoryCursorContainer,
  VictoryLabel,
  VictoryLabelProps,
  VictoryLine,
  VictoryPortal,
  VictoryScatter,
  VictoryThemeDefinition,
} from "victory";
import { VictoryAxis } from "victory";

import ChartContainer from "@/components/charts/primitives/chart_container";
import ChartCursorLabel from "@/components/charts/primitives/chart_cursor_label";
import PredictionWithRange from "@/components/charts/primitives/prediction_with_range";
import XTickLabel from "@/components/charts/primitives/x_tick_label";
import { darkTheme, lightTheme } from "@/constants/chart_theme";
import { METAC_COLORS } from "@/constants/colors";
import useAppTheme from "@/hooks/use_app_theme";
import useContainerSize from "@/hooks/use_container_size";
import usePrevious from "@/hooks/use_previous";
import {
  Area,
  Line,
  LinePoint,
  Scale,
  TimelineChartZoomOption,
} from "@/types/charts";
import { ThemeColor } from "@/types/theme";
import { getAxisRightPadding, getTickLabelFontSize } from "@/utils/charts/axis";
import cn from "@/utils/core/cn";

type ChartData = {
  line: Line;
  area: Area;
  points: Line;
  yDomain: DomainTuple;
  xDomain: DomainTuple;
  yScale: Scale;
  xScale: Scale;
};

type Props = {
  buildChartData: (width: number, zoom: TimelineChartZoomOption) => ChartData;
  chartTitle?: string;
  height?: number;
  hideCP?: boolean;
  defaultZoom?: TimelineChartZoomOption;
  withZoomPicker?: boolean;
  resolutionPoint?: LinePoint[];
  yLabel?: string;
  tickFontSize?: number;
  extraTheme?: VictoryThemeDefinition;
  onChartReady?: () => void;
  onCursorChange?: (value: number | null) => void;
  getCursorValue?: (value: number) => string;
  colorOverride?: ThemeColor;
  nonInteractive?: boolean;
};

const BOTTOM_PADDING = 20;
const LABEL_FONT_FAMILY = "Inter";

const NewNumericChart: FC<Props> = ({
  buildChartData,
  chartTitle,
  height = 170,
  hideCP,
  defaultZoom = TimelineChartZoomOption.All,
  withZoomPicker = false,
  resolutionPoint,
  yLabel,
  tickFontSize = 10,
  extraTheme,
  onChartReady,
  onCursorChange,
  getCursorValue,
  colorOverride,
  nonInteractive = false,
}) => {
  const { theme, getThemeColor } = useAppTheme();
  const [isChartReady, setIsChartReady] = useState(false);
  const [zoom, setZoom] = useState(defaultZoom);
  const [isCursorActive, setIsCursorActive] = useState(false);
  const { ref: chartContainerRef, width: chartWidth } =
    useContainerSize<HTMLDivElement>();
  const { line, area, points, yDomain, xDomain, yScale, xScale } = useMemo(
    () => buildChartData(chartWidth, zoom),
    [chartWidth, zoom, buildChartData]
  );
  const shouldAdjustCursorLabel = line.at(-1)?.x !== xDomain.at(-1);
  const defaultCursor = useMemo(
    () => line.at(-1)?.x ?? Date.now() / 1000,
    [line]
  );
  const [cursorTimestamp, setCursorTimestamp] = useState(defaultCursor);
  const handleCursorChange = useCallback(
    (value: number | null) => {
      setCursorTimestamp(isNil(value) ? defaultCursor : value);
      onCursorChange?.(value);
    },
    [defaultCursor, onCursorChange]
  );
  const chartTheme = theme === "dark" ? darkTheme : lightTheme;
  const actualTheme = extraTheme
    ? merge({}, chartTheme, extraTheme)
    : chartTheme;
  const tickLabelFontSize =
    isNil(tickFontSize) || !isNil(extraTheme)
      ? getTickLabelFontSize(actualTheme)
      : tickFontSize;

  const highlightedLine = useMemo(() => {
    const filteredLine = line.filter((point) => point.x <= cursorTimestamp);
    // fix visual issue when highlighted line ends before cursor timestamp
    const lastFilteredPointIndex = filteredLine.length - 1;
    const lastFilteredPoint = line[lastFilteredPointIndex];
    const nextPoint = line[lastFilteredPointIndex + 1];

    if (
      !!lastFilteredPoint &&
      lastFilteredPoint.x < cursorTimestamp &&
      !isNil(nextPoint?.y)
    ) {
      filteredLine.push({
        x: cursorTimestamp,
        y: lastFilteredPoint.y,
      });
    }
    return filteredLine;
  }, [cursorTimestamp, line]);

  const highlightedPoint = useMemo(() => {
    return highlightedLine.at(-1);
  }, [highlightedLine]);

  const handleChartReady = useCallback(() => {
    setIsChartReady(true);
    onChartReady?.();
  }, [onChartReady]);

  const prevWidth = usePrevious(chartWidth);
  useEffect(() => {
    if (!prevWidth && chartWidth && handleChartReady) {
      handleChartReady();
    }
  }, [prevWidth, chartWidth, handleChartReady]);

  const { rightPadding, MIN_RIGHT_PADDING } = useMemo(() => {
    return getAxisRightPadding(yScale, tickLabelFontSize as number, yLabel);
  }, [yScale, tickLabelFontSize, yLabel]);
  const maxPadding = useMemo(() => {
    return Math.max(rightPadding, MIN_RIGHT_PADDING);
  }, [rightPadding, MIN_RIGHT_PADDING]);

  const CursorContainer = (
    <VictoryCursorContainer
      cursorDimension={"x"}
      defaultCursor={defaultCursor}
      style={{
        touchAction: "pan-y",
      }}
      cursorLabelOffset={{
        x: 0,
        y: 0,
      }}
      cursorLabel={({ datum }: VictoryLabelProps) => {
        if (datum) {
          return datum.x === defaultCursor
            ? ""
            : xScale.cursorFormat?.(datum.x) ?? xScale.tickFormat(datum.x);
        }
      }}
      cursorComponent={
        <LineSegment
          style={{
            stroke: getThemeColor(METAC_COLORS.blue["700"]),
            opacity: 0.5,
            strokeDasharray: "5,2",
          }}
        />
      }
      cursorLabelComponent={
        <VictoryPortal>
          <ChartCursorLabel
            positionY={height - 10}
            fill={getThemeColor(METAC_COLORS.gray["700"])}
            style={{
              fontFamily: LABEL_FONT_FAMILY,
            }}
          />
        </VictoryPortal>
      }
      onCursorChange={(value: CursorCoordinatesPropType) => {
        if (typeof value === "number") {
          handleCursorChange(value);
        } else {
          handleCursorChange(null);
        }
      }}
    />
  );

  const shouldDisplayChart =
    !!chartWidth && !!xScale.ticks.length && yScale.ticks.length;

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        isChartReady ? "opacity-100" : "opacity-0"
      )}
    >
      <ChartContainer
        ref={chartContainerRef}
        height={height}
        zoom={withZoomPicker ? zoom : undefined}
        onZoomChange={setZoom}
        chartTitle={chartTitle}
      >
        {shouldDisplayChart && (
          <VictoryChart
            domain={{
              y: yDomain,
              x: xDomain,
            }}
            width={chartWidth}
            height={height}
            theme={actualTheme}
            padding={{
              right: maxPadding,
              top: 10,
              left: 0,
              bottom: BOTTOM_PADDING,
            }}
            events={[
              {
                target: "parent",
                eventHandlers: {
                  onTouchStart: () => {
                    if (nonInteractive) return;
                    setIsCursorActive(true);
                  },
                  onMouseOverCapture: () => {
                    if (nonInteractive) return;
                    setIsCursorActive(true);
                  },
                  onMouseOutCapture: () => {
                    if (nonInteractive) return;
                    setIsCursorActive(false);
                  },
                  onMouseLeave: () => {
                    if (nonInteractive) return;
                    setIsCursorActive(false);
                    handleCursorChange(null);
                  },
                },
              },
            ]}
            containerComponent={
              nonInteractive ? (
                <VictoryContainer
                  style={{
                    pointerEvents: "auto",
                    userSelect: "auto",
                    touchAction: "auto",
                  }}
                />
              ) : (
                CursorContainer
              )
            }
          >
            {/* Y axis */}
            <VictoryAxis
              dependentAxis
              style={{
                ticks: {
                  stroke: "transparent",
                },
                axisLabel: {
                  fontFamily: LABEL_FONT_FAMILY,
                  fontSize: tickLabelFontSize,
                  fill: getThemeColor(METAC_COLORS.gray["700"]),
                },
                tickLabels: {
                  fontFamily: LABEL_FONT_FAMILY,
                  padding: 5,
                  fontSize: tickLabelFontSize,
                  fill: getThemeColor(METAC_COLORS.gray["700"]),
                },
                axis: {
                  stroke: "transparent",
                },
                grid: {
                  stroke: getThemeColor(METAC_COLORS.gray["300"]),
                  strokeWidth: 1,
                  strokeDasharray: "2, 5",
                },
              }}
              tickValues={yScale.ticks}
              tickFormat={yScale.tickFormat}
              label={yLabel}
              orientation="left"
              offsetX={
                isNil(yLabel) ? chartWidth + 5 : chartWidth - tickFontSize + 5
              }
              axisLabelComponent={<VictoryLabel x={chartWidth} />}
            />
            {/* X axis */}
            <VictoryAxis
              style={{
                ticks: {
                  stroke: "transparent",
                },
                axis: {
                  stroke: "transparent",
                },
              }}
              offsetY={BOTTOM_PADDING}
              tickValues={xScale.ticks}
              tickFormat={isCursorActive ? () => "" : xScale.tickFormat}
              tickLabelComponent={
                <VictoryPortal>
                  <XTickLabel
                    chartWidth={chartWidth}
                    withCursor={true}
                    fontSize={tickLabelFontSize}
                    style={{
                      fontFamily: LABEL_FONT_FAMILY,
                      fill: getThemeColor(METAC_COLORS.gray["700"]),
                    }}
                  />
                </VictoryPortal>
              }
            />
            {/* CP range */}
            {!hideCP && (
              <VictoryArea
                data={area}
                style={{
                  data: {
                    opacity: 0.3,
                  },
                }}
                interpolation="stepAfter"
              />
            )}
            {/* CP Line background*/}
            {!hideCP && (
              <VictoryLine
                data={line}
                style={{
                  data: {
                    strokeWidth: 2.5,
                    ...(!isNil(colorOverride) && {
                      stroke: getThemeColor(colorOverride),
                    }),
                    opacity: 0.2,
                  },
                }}
                interpolation="stepAfter"
              />
            )}
            {/* CP Line */}
            {!hideCP && (
              <VictoryLine
                data={highlightedLine}
                style={{
                  data: {
                    strokeWidth: 2.5,
                    ...(!isNil(colorOverride) && {
                      stroke: getThemeColor(colorOverride),
                    }),
                  },
                }}
                interpolation="stepAfter"
              />
            )}
            {/* Cursor line value */}
            {!isNil(highlightedPoint) && !hideCP && (
              <VictoryScatter
                data={[highlightedPoint]}
                dataComponent={
                  <VictoryPortal>
                    <CursorValue
                      isCursorActive={shouldAdjustCursorLabel || isCursorActive}
                      chartWidth={chartWidth}
                      rightPadding={maxPadding}
                      colorOverride={colorOverride}
                      getCursorValue={getCursorValue}
                    />
                  </VictoryPortal>
                }
              />
            )}
            {/* Prediciton points */}
            <VictoryScatter
              data={points}
              dataComponent={<PredictionWithRange />}
            />
            {!!resolutionPoint && (
              <VictoryScatter
                data={resolutionPoint}
                style={{
                  data: {
                    stroke: getThemeColor(METAC_COLORS.purple["800"]),
                    fill: "none",
                    strokeWidth: 2.5,
                  },
                }}
              />
            )}
          </VictoryChart>
        )}
      </ChartContainer>
    </div>
  );
};

const CursorValue: React.FC<{
  x?: number;
  y?: number;
  datum?: any;
  isCursorActive: boolean;
  chartWidth: number;
  rightPadding: number;
  colorOverride?: ThemeColor;
  getCursorValue?: (value: number) => string;
}> = (props) => {
  const TEXT_PADDING = 4;
  const { getThemeColor } = useAppTheme();
  const {
    x,
    y,
    datum,
    isCursorActive,
    chartWidth,
    rightPadding,
    colorOverride,
    getCursorValue,
  } = props;
  const [textWidth, setTextWidth] = useState(0);
  const textRef = useRef<SVGTextElement>(null);
  useEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.getBBox().width + TEXT_PADDING);
    }
  }, [datum?.y]);
  if (isNil(x) || isNil(y)) return null;

  const adjustedX = isCursorActive
    ? x
    : chartWidth - rightPadding + textWidth / 2;
  const chipHeight = 16;
  const chipFontSize = 12;
  return (
    <g>
      <rect
        x={adjustedX - textWidth / 2}
        y={y - chipHeight / 2}
        width={textWidth}
        height={chipHeight}
        fill={
          isNil(colorOverride)
            ? getThemeColor(METAC_COLORS.olive["600"])
            : getThemeColor(colorOverride)
        }
        stroke="transparent"
        rx={2}
        ry={2}
      />
      <text
        ref={textRef}
        x={adjustedX}
        y={y + chipFontSize / 10} // fix vertical alignment
        textAnchor="middle"
        dominantBaseline="middle"
        fill={getThemeColor(METAC_COLORS.gray["0"])}
        fontWeight="bold"
        fontSize={chipFontSize}
      >
        {getCursorValue ? getCursorValue(datum.y) : datum.y.toFixed(1)}
      </text>
    </g>
  );
};

export default NewNumericChart;
