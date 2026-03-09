import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";

interface ChartData {
  label: string;
  value: number;
}

interface AnalyticsChartProps {
  title: string;
  data: ChartData[];
  color?: string;
  showLabels?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  title,
  data,
  color = "#4c6fff",
  showLabels = true,
}) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const chartWidth = SCREEN_WIDTH - 80;
  const barWidth = Math.min(30, (chartWidth - (data.length - 1) * 4) / data.length);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chartContainer}>
        <View style={styles.chart}>
          {data.map((item, index) => {
            const barHeight = (item.value / maxValue) * 120;
            return (
              <View key={index} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <View 
                    style={[
                      styles.bar, 
                      { 
                        height: Math.max(barHeight, 4),
                        backgroundColor: color,
                        width: barWidth,
                      }
                    ]} 
                  />
                </View>
                {showLabels && (
                  <Text style={styles.label} numberOfLines={1}>
                    {item.label}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>{maxValue}</Text>
          <Text style={styles.yLabel}>{Math.round(maxValue / 2)}</Text>
          <Text style={styles.yLabel}>0</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  chartContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  chart: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 150,
    paddingBottom: 24,
  },
  barContainer: {
    alignItems: "center",
    flex: 1,
  },
  barWrapper: {
    height: 120,
    justifyContent: "flex-end",
  },
  bar: {
    borderRadius: 4,
    minHeight: 4,
  },
  label: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
    width: 40,
  },
  yAxis: {
    justifyContent: "space-between",
    height: 120,
    paddingLeft: 8,
    marginBottom: 24,
  },
  yLabel: {
    fontSize: 10,
    color: "#9ca3af",
  },
});

export default AnalyticsChart;
