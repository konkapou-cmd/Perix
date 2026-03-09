import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import {
  AdminStats,
  ReportedUser,
  User,
  UserContentCounts,
  checkAdminStatus,
  getAdminStats,
  getReportedUsers,
  getAllUsers,
  manageUser,
  dismissReport,
  getUserContentCounts,
  getAdminPromoters,
  processPromoterPayout,
  getAdminPaymentTransactions,
  AdminPromoter,
  PaymentTransaction,
} from "../lib/api";

type TabType = "overview" | "reports" | "users" | "promoters" | "transactions";

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { safeGoBack } = useSafeNavigation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [reports, setReports] = useState<ReportedUser[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);
  
  // Promoters state
  const [promoters, setPromoters] = useState<AdminPromoter[]>([]);
  const [promotersLoading, setPromotersLoading] = useState(false);
  
  // Transactions state
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  
  const [payoutModal, setPayoutModal] = useState<{
    visible: boolean;
    promoter: AdminPromoter | null;
    amount: string;
    processing: boolean;
  }>({
    visible: false,
    promoter: null,
    amount: "",
    processing: false,
  });
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    userId: string;
    userName: string;
    action: "hide" | "unhide" | "delete";
    counts: UserContentCounts | null;
    loading: boolean;
  }>({
    visible: false,
    userId: "",
    userName: "",
    action: "hide",
    counts: null,
    loading: false,
  });

  const loadData = useCallback(async () => {
    if (!sessionToken) return;
    
    try {
      // Check admin status first
      const adminCheck = await checkAdminStatus(sessionToken);
      setIsAdmin(adminCheck.is_admin);
      
      if (!adminCheck.is_admin) {
        setLoading(false);
        return;
      }
      
      // Load data based on active tab
      const [statsData, reportsData] = await Promise.all([
        getAdminStats(sessionToken),
        getReportedUsers(sessionToken),
      ]);
      
      setStats(statsData);
      setReports(reportsData);
    } catch (error) {
      console.error("Failed to load admin data:", error);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  const loadUsers = useCallback(async () => {
    if (!sessionToken || !isAdmin) return;
    try {
      const usersData = await getAllUsers(
        sessionToken, 
        searchQuery || undefined, 
        showHiddenOnly
      );
      setUsers(usersData);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }, [sessionToken, isAdmin, searchQuery, showHiddenOnly]);

  // Load promoters
  const loadPromoters = useCallback(async () => {
    if (!sessionToken || !isAdmin) return;
    setPromotersLoading(true);
    try {
      const result = await getAdminPromoters(sessionToken);
      setPromoters(result.promoters || []);
    } catch (error) {
      console.error("Failed to load promoters:", error);
    } finally {
      setPromotersLoading(false);
    }
  }, [sessionToken, isAdmin]);

  // Load transactions
  const loadTransactions = useCallback(async () => {
    if (!sessionToken || !isAdmin) return;
    setTransactionsLoading(true);
    try {
      const result = await getAdminPaymentTransactions(sessionToken);
      setTransactions(result.transactions || []);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setTransactionsLoading(false);
    }
  }, [sessionToken, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === "users" && isAdmin) {
      loadUsers();
    }
    if (activeTab === "promoters" && isAdmin) {
      loadPromoters();
    }
    if (activeTab === "transactions" && isAdmin) {
      loadTransactions();
    }
  }, [activeTab, isAdmin, loadUsers, loadPromoters, loadTransactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (activeTab === "users") {
      await loadUsers();
    }
    if (activeTab === "promoters") {
      await loadPromoters();
    }
    if (activeTab === "transactions") {
      await loadTransactions();
    }
    setRefreshing(false);
  };

  // Handle payout to promoter
  const handlePayout = async () => {
    if (!sessionToken || !payoutModal.promoter) return;
    
    const amount = parseFloat(payoutModal.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t("admin.error"), t("admin.invalidAmount") || "Invalid amount");
      return;
    }
    
    if (amount > payoutModal.promoter.pending_payout) {
      Alert.alert(t("admin.error"), t("admin.amountExceedsPending") || "Amount exceeds pending payout");
      return;
    }
    
    setPayoutModal(prev => ({ ...prev, processing: true }));
    
    try {
      const result = await processPromoterPayout(sessionToken, payoutModal.promoter.promoter_id, amount);
      Alert.alert(
        t("admin.success") || "Success",
        `${t("admin.payoutProcessed") || "Payout processed!"} €${amount.toFixed(2)}`
      );
      setPayoutModal({ visible: false, promoter: null, amount: "", processing: false });
      loadPromoters();
    } catch (error: any) {
      Alert.alert(t("admin.error"), error.message || "Failed to process payout");
      setPayoutModal(prev => ({ ...prev, processing: false }));
    }
  };

  const handleUserAction = async (userId: string, action: "hide" | "unhide" | "delete", userName: string) => {
    // Show confirmation modal with loading state
    setConfirmModal({
      visible: true,
      userId,
      userName,
      action,
      counts: null,
      loading: true,
    });
    
    // Fetch content counts
    try {
      const counts = await getUserContentCounts(sessionToken!, userId);
      setConfirmModal(prev => ({
        ...prev,
        counts,
        loading: false,
      }));
    } catch (error) {
      console.error("Failed to get content counts:", error);
      setConfirmModal(prev => ({
        ...prev,
        loading: false,
      }));
    }
  };
  
  const executeUserAction = async () => {
    const { userId, action } = confirmModal;
    setConfirmModal(prev => ({ ...prev, loading: true }));
    
    try {
      await manageUser(sessionToken!, userId, action);
      setConfirmModal({ visible: false, userId: "", userName: "", action: "hide", counts: null, loading: false });
      await loadData();
      if (activeTab === "users") {
        await loadUsers();
      }
    } catch (error) {
      Alert.alert("Error", "Failed to perform action");
      setConfirmModal(prev => ({ ...prev, loading: false }));
    }
  };
  
  const closeConfirmModal = () => {
    setConfirmModal({ visible: false, userId: "", userName: "", action: "hide", counts: null, loading: false });
  };

  const handleDismissReport = async (reportId: string) => {
    Alert.alert(
      "Dismiss Report",
      "Are you sure you want to dismiss this report?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Dismiss", 
          onPress: async () => {
            try {
              await dismissReport(sessionToken!, reportId);
              setReports(prev => prev.filter(r => r.report_id !== reportId));
            } catch (error) {
              Alert.alert("Error", "Failed to dismiss report");
            }
          }
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#4c6fff" />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="lock-closed" size={48} color="#ef4444" />
        <Text style={styles.noAccessTitle}>Access Denied</Text>
        <Text style={styles.noAccessText}>You don't have admin privileges.</Text>
        <Pressable style={styles.backButton} onPress={safeGoBack}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={safeGoBack} style={styles.headerBack}>
            <Ionicons name="chevron-back" size={24} color="#4c6fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(["overview", "reports", "users", "promoters", "transactions"] as TabType[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "transactions" ? "Txns" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "reports" && reports.length > 0 && (
                  <Text style={styles.tabBadge}> ({reports.length})</Text>
                )}
                {tab === "promoters" && promoters.length > 0 && (
                  <Text style={styles.tabBadge}> ({promoters.length})</Text>
                )}
                {tab === "transactions" && transactions.length > 0 && (
                  <Text style={styles.tabBadge}> ({transactions.length})</Text>
                )}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Overview Tab */}
        {activeTab === "overview" && stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="people" size={28} color="#4c6fff" />
              <Text style={styles.statValue}>{stats.total_users}</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="checkmark-circle" size={28} color="#10b981" />
              <Text style={styles.statValue}>{stats.active_users}</Text>
              <Text style={styles.statLabel}>Active Users</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="eye-off" size={28} color="#f59e0b" />
              <Text style={styles.statValue}>{stats.hidden_users}</Text>
              <Text style={styles.statLabel}>Hidden Users</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flag" size={28} color="#ef4444" />
              <Text style={styles.statValue}>{stats.pending_reports}</Text>
              <Text style={styles.statLabel}>Pending Reports</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="document-text" size={28} color="#8b5cf6" />
              <Text style={styles.statValue}>{stats.total_posts}</Text>
              <Text style={styles.statLabel}>Total Posts</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="business" size={28} color="#06b6d4" />
              <Text style={styles.statValue}>{stats.total_businesses}</Text>
              <Text style={styles.statLabel}>Businesses</Text>
            </View>
          </View>
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <View>
            {reports.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={48} color="#10b981" />
                <Text style={styles.emptyTitle}>No Pending Reports</Text>
                <Text style={styles.emptyText}>All reports have been reviewed.</Text>
              </View>
            ) : (
              reports.map((report) => (
                <View key={report.report_id} style={styles.reportCard}>
                  <View style={styles.reportHeader}>
                    <View style={styles.reportUser}>
                      {report.profile_photo ? (
                        <Image source={{ uri: report.profile_photo }} style={styles.reportAvatar} />
                      ) : (
                        <View style={styles.reportAvatarPlaceholder}>
                          <Text style={styles.reportAvatarText}>
                            {report.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View>
                        <Text style={styles.reportUserName}>{report.name}</Text>
                        <Text style={styles.reportUserEmail}>{report.email}</Text>
                      </View>
                    </View>
                    <View style={[
                      styles.statusBadge, 
                      report.is_hidden ? styles.statusHidden : styles.statusActive
                    ]}>
                      <Text style={styles.statusText}>
                        {report.is_hidden ? "Hidden" : "Active"}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportLabel}>Reported by:</Text>
                    <Text style={styles.reportValue}>{report.reporter_name}</Text>
                  </View>
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportLabel}>Reason:</Text>
                    <Text style={styles.reportReason}>{report.reason}</Text>
                  </View>
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportLabel}>Total Reports:</Text>
                    <Text style={[styles.reportValue, { color: "#ef4444" }]}>
                      {report.report_count}
                    </Text>
                  </View>
                  
                  <View style={styles.reportActions}>
                    {report.is_hidden ? (
                      <Pressable 
                        style={[styles.actionBtn, styles.actionBtnRestore]}
                        onPress={() => handleUserAction(report.user_id, "unhide", report.name)}
                      >
                        <Ionicons name="eye" size={16} color="#10b981" />
                        <Text style={[styles.actionBtnText, { color: "#10b981" }]}>Restore</Text>
                      </Pressable>
                    ) : (
                      <Pressable 
                        style={[styles.actionBtn, styles.actionBtnHide]}
                        onPress={() => handleUserAction(report.user_id, "hide", report.name)}
                      >
                        <Ionicons name="eye-off" size={16} color="#f59e0b" />
                        <Text style={[styles.actionBtnText, { color: "#f59e0b" }]}>Hide</Text>
                      </Pressable>
                    )}
                    <Pressable 
                      style={[styles.actionBtn, styles.actionBtnDelete]}
                      onPress={() => handleUserAction(report.user_id, "delete", report.name)}
                    >
                      <Ionicons name="trash" size={16} color="#ef4444" />
                      <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Delete</Text>
                    </Pressable>
                    <Pressable 
                      style={[styles.actionBtn, styles.actionBtnDismiss]}
                      onPress={() => handleDismissReport(report.report_id)}
                    >
                      <Ionicons name="close-circle" size={16} color="#6b7280" />
                      <Text style={[styles.actionBtnText, { color: "#6b7280" }]}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <View>
            <View style={styles.searchRow}>
              <View style={styles.searchInput}>
                <Ionicons name="search" size={18} color="#9ca3af" />
                <TextInput
                  style={styles.searchInputField}
                  placeholder="Search users..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={loadUsers}
                />
              </View>
              <Pressable 
                style={[styles.filterBtn, showHiddenOnly && styles.filterBtnActive]}
                onPress={() => setShowHiddenOnly(!showHiddenOnly)}
              >
                <Ionicons name="eye-off" size={18} color={showHiddenOnly ? "#fff" : "#6b7280"} />
              </Pressable>
            </View>
            
            {users.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyTitle}>No Users Found</Text>
              </View>
            ) : (
              users.map((userItem: any) => (
                <Pressable 
                  key={userItem.user_id} 
                  style={styles.userCard}
                  onPress={() => {
                    // Show user's reports if any
                    const userReports = reports.filter(r => r.user_id === userItem.user_id);
                    if (userReports.length > 0) {
                      Alert.alert(
                        `Reports for ${userItem.name}`,
                        userReports.map((r, i) => `${i + 1}. ${r.reason}\n   - by ${r.reporter_name}`).join('\n\n'),
                        [
                          { text: "Close", style: "cancel" },
                          { text: "Hide User", style: "destructive", onPress: () => handleUserAction(userItem.user_id, "hide", userItem.name) }
                        ]
                      );
                    } else {
                      Alert.alert(userItem.name, `Email: ${userItem.email}\nNo reports for this user.`);
                    }
                  }}
                >
                  <View style={styles.userInfo}>
                    {userItem.profile_photo || userItem.picture ? (
                      <Image 
                        source={{ uri: userItem.profile_photo || userItem.picture }} 
                        style={styles.userAvatar} 
                      />
                    ) : (
                      <View style={styles.userAvatarPlaceholder}>
                        <Text style={styles.userAvatarText}>
                          {userItem.name?.charAt(0).toUpperCase() || "?"}
                        </Text>
                      </View>
                    )}
                    <View style={styles.userDetails}>
                      <Text style={styles.userName}>{userItem.name}</Text>
                      <Text style={styles.userEmail}>{userItem.email}</Text>
                      {userItem.report_count > 0 && (
                        <Text style={styles.userReports}>
                          {userItem.report_count} report(s)
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.userActions}>
                    {userItem.is_hidden ? (
                      <Pressable 
                        style={styles.userActionBtn}
                        onPress={() => handleUserAction(userItem.user_id, "unhide", userItem.name)}
                      >
                        <Ionicons name="eye" size={20} color="#10b981" />
                      </Pressable>
                    ) : (
                      <Pressable 
                        style={styles.userActionBtn}
                        onPress={() => handleUserAction(userItem.user_id, "hide", userItem.name)}
                      >
                        <Ionicons name="eye-off" size={20} color="#f59e0b" />
                      </Pressable>
                    )}
                    <Pressable 
                      style={styles.userActionBtn}
                      onPress={() => handleUserAction(userItem.user_id, "delete", userItem.name)}
                    >
                      <Ionicons name="trash" size={20} color="#ef4444" />
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* Promoters Tab */}
        {activeTab === "promoters" && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Promoters & Affiliates</Text>
              <Text style={styles.sectionSubtitle}>Manage your promoter network</Text>
            </View>

            {promotersLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#4c6fff" />
                <Text style={styles.loadingText}>Loading promoters...</Text>
              </View>
            ) : promoters.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyTitle}>No Promoters Yet</Text>
                <Text style={styles.emptySubtitle}>Promoters will appear here when they register</Text>
              </View>
            ) : (
              <>
                {/* Summary Stats */}
                <View style={styles.promoterStats}>
                  <View style={styles.promoterStatItem}>
                    <Text style={styles.promoterStatValue}>
                      €{promoters.reduce((sum, p) => sum + (p.total_earnings || 0), 0).toFixed(2)}
                    </Text>
                    <Text style={styles.promoterStatLabel}>Total Earned</Text>
                  </View>
                  <View style={styles.promoterStatItem}>
                    <Text style={[styles.promoterStatValue, { color: "#f59e0b" }]}>
                      €{promoters.reduce((sum, p) => sum + (p.pending_payout || 0), 0).toFixed(2)}
                    </Text>
                    <Text style={styles.promoterStatLabel}>Pending Payouts</Text>
                  </View>
                  <View style={styles.promoterStatItem}>
                    <Text style={styles.promoterStatValue}>
                      {promoters.reduce((sum, p) => sum + (p.total_referrals || 0), 0)}
                    </Text>
                    <Text style={styles.promoterStatLabel}>Total Referrals</Text>
                  </View>
                </View>

                {/* Promoter Cards */}
                {promoters.map((promoter) => (
                  <View key={promoter.promoter_id} style={styles.promoterCard}>
                    <View style={styles.promoterHeader}>
                      <View style={styles.promoterAvatar}>
                        <Text style={styles.promoterAvatarText}>
                          {promoter.name?.charAt(0).toUpperCase() || "P"}
                        </Text>
                      </View>
                      <View style={styles.promoterInfo}>
                        <Text style={styles.promoterName}>{promoter.name}</Text>
                        <Text style={styles.promoterEmail}>{promoter.email}</Text>
                        <View style={styles.promoterCodeBadge}>
                          <Ionicons name="pricetag" size={12} color="#4c6fff" />
                          <Text style={styles.promoterCode}>{promoter.promoter_code}</Text>
                        </View>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        promoter.status === "active" ? styles.statusActive : styles.statusInactive
                      ]}>
                        <Text style={styles.statusText}>
                          {promoter.status === "active" ? "Active" : "Inactive"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.promoterMetrics}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{promoter.total_referrals || 0}</Text>
                        <Text style={styles.metricLabel}>Referrals</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>€{(promoter.total_earnings || 0).toFixed(2)}</Text>
                        <Text style={styles.metricLabel}>Total Earned</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={[styles.metricValue, { color: "#f59e0b" }]}>
                          €{(promoter.pending_payout || 0).toFixed(2)}
                        </Text>
                        <Text style={styles.metricLabel}>Pending</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{promoter.share_percentage || 30}%</Text>
                        <Text style={styles.metricLabel}>Share</Text>
                      </View>
                    </View>

                    {promoter.pending_payout > 0 && (
                      <Pressable
                        style={styles.payoutButton}
                        onPress={() => setPayoutModal({
                          visible: true,
                          promoter,
                          amount: promoter.pending_payout.toFixed(2),
                          processing: false
                        })}
                      >
                        <Ionicons name="cash" size={18} color="#fff" />
                        <Text style={styles.payoutButtonText}>Process Payout</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Transactions Tab */}
        {activeTab === "transactions" && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Payment Transactions</Text>
              <Text style={styles.sectionSubtitle}>All subscription payments</Text>
            </View>

            {transactionsLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#4c6fff" />
                <Text style={styles.loadingText}>Loading transactions...</Text>
              </View>
            ) : transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyTitle}>No Transactions Yet</Text>
                <Text style={styles.emptySubtitle}>Payments will appear here</Text>
              </View>
            ) : (
              <>
                {/* Revenue Summary */}
                <View style={styles.promoterStats}>
                  <View style={styles.promoterStatItem}>
                    <Text style={[styles.promoterStatValue, { color: "#10b981" }]}>
                      €{transactions.filter(t => t.payment_status === "paid").reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(2)}
                    </Text>
                    <Text style={styles.promoterStatLabel}>Total Revenue</Text>
                  </View>
                  <View style={styles.promoterStatItem}>
                    <Text style={styles.promoterStatValue}>
                      {transactions.filter(t => t.payment_status === "paid").length}
                    </Text>
                    <Text style={styles.promoterStatLabel}>Paid</Text>
                  </View>
                  <View style={styles.promoterStatItem}>
                    <Text style={[styles.promoterStatValue, { color: "#f59e0b" }]}>
                      {transactions.filter(t => t.payment_status === "pending").length}
                    </Text>
                    <Text style={styles.promoterStatLabel}>Pending</Text>
                  </View>
                </View>

                {/* Transaction List */}
                {transactions.map((txn) => (
                  <View key={txn.transaction_id} style={styles.transactionCard}>
                    <View style={styles.transactionHeader}>
                      <View style={[
                        styles.transactionStatusDot,
                        txn.payment_status === "paid" ? styles.statusPaid : styles.statusPending
                      ]} />
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionAmount}>€{(txn.amount || 0).toFixed(2)}</Text>
                        <Text style={styles.transactionPlan}>{txn.plan_type} plan</Text>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        txn.payment_status === "paid" ? styles.statusActive : { backgroundColor: "rgba(245, 158, 11, 0.15)" }
                      ]}>
                        <Text style={[
                          styles.statusText,
                          txn.payment_status !== "paid" && { color: "#f59e0b" }
                        ]}>
                          {txn.payment_status}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.transactionDetails}>
                      <View style={styles.transactionDetailRow}>
                        <Text style={styles.transactionLabel}>Business ID</Text>
                        <Text style={styles.transactionValue}>{txn.business_id?.slice(0, 12)}...</Text>
                      </View>
                      {txn.promoter_amount > 0 && (
                        <View style={styles.transactionDetailRow}>
                          <Text style={styles.transactionLabel}>Promoter Share</Text>
                          <Text style={[styles.transactionValue, { color: "#f59e0b" }]}>€{txn.promoter_amount.toFixed(2)}</Text>
                        </View>
                      )}
                      <View style={styles.transactionDetailRow}>
                        <Text style={styles.transactionLabel}>Date</Text>
                        <Text style={styles.transactionValue}>
                          {new Date(txn.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
      
      {/* Payout Modal */}
      <Modal
        visible={payoutModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPayoutModal({ visible: false, promoter: null, amount: "", processing: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.payoutModal}>
            <Text style={styles.payoutModalTitle}>Process Payout</Text>
            {payoutModal.promoter && (
              <>
                <Text style={styles.payoutPromoterName}>{payoutModal.promoter.name}</Text>
                <Text style={styles.payoutPendingLabel}>
                  Pending: €{payoutModal.promoter.pending_payout.toFixed(2)}
                </Text>
                
                <View style={styles.payoutInputRow}>
                  <Text style={styles.payoutCurrency}>€</Text>
                  <TextInput
                    style={styles.payoutInput}
                    value={payoutModal.amount}
                    onChangeText={(text) => setPayoutModal(prev => ({ ...prev, amount: text }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                
                <View style={styles.payoutActions}>
                  <Pressable
                    style={styles.payoutCancelBtn}
                    onPress={() => setPayoutModal({ visible: false, promoter: null, amount: "", processing: false })}
                    disabled={payoutModal.processing}
                  >
                    <Text style={styles.payoutCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.payoutConfirmBtn, payoutModal.processing && styles.btnDisabled]}
                    onPress={handlePayout}
                    disabled={payoutModal.processing}
                  >
                    {payoutModal.processing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.payoutConfirmText}>Confirm Payout</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      
      {/* Confirmation Modal */}
      <Modal
        visible={confirmModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmHeader}>
              <Ionicons 
                name={
                  confirmModal.action === "delete" ? "trash" : 
                  confirmModal.action === "hide" ? "eye-off" : "eye"
                } 
                size={32} 
                color={
                  confirmModal.action === "delete" ? "#ef4444" : 
                  confirmModal.action === "hide" ? "#f59e0b" : "#10b981"
                } 
              />
              <Text style={styles.confirmTitle}>
                {confirmModal.action === "delete" ? "Delete User" : 
                 confirmModal.action === "hide" ? "Hide User" : "Restore User"}
              </Text>
              <Text style={styles.confirmUserName}>{confirmModal.userName}</Text>
            </View>
            
            {confirmModal.loading ? (
              <View style={styles.confirmLoading}>
                <ActivityIndicator size="large" color="#4c6fff" />
                <Text style={styles.confirmLoadingText}>
                  {confirmModal.counts ? "Processing..." : "Loading content..."}
                </Text>
              </View>
            ) : confirmModal.counts ? (
              <ScrollView style={styles.countsScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.countsTitle}>
                  {confirmModal.action === "delete" 
                    ? "The following content will be permanently deleted:" 
                    : confirmModal.action === "hide"
                    ? "The following content will be hidden:"
                    : "The following content will be restored:"}
                </Text>
                
                <View style={styles.countsGrid}>
                  {confirmModal.counts.posts > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.posts}</Text>
                      <Text style={styles.countLabel}>Posts</Text>
                    </View>
                  )}
                  {confirmModal.counts.stories > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.stories}</Text>
                      <Text style={styles.countLabel}>Stories</Text>
                    </View>
                  )}
                  {confirmModal.counts.activities > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.activities}</Text>
                      <Text style={styles.countLabel}>Activities</Text>
                    </View>
                  )}
                  {confirmModal.counts.events > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.events}</Text>
                      <Text style={styles.countLabel}>Events</Text>
                    </View>
                  )}
                  {confirmModal.counts.businesses > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.businesses}</Text>
                      <Text style={styles.countLabel}>Businesses</Text>
                    </View>
                  )}
                  {confirmModal.counts.artists > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.artists}</Text>
                      <Text style={styles.countLabel}>Artists</Text>
                    </View>
                  )}
                  {confirmModal.counts.messages > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.messages}</Text>
                      <Text style={styles.countLabel}>Messages</Text>
                    </View>
                  )}
                  {confirmModal.counts.friends > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.friends}</Text>
                      <Text style={styles.countLabel}>Friends</Text>
                    </View>
                  )}
                  {confirmModal.counts.likes_on_posts > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.likes_on_posts}</Text>
                      <Text style={styles.countLabel}>Likes</Text>
                    </View>
                  )}
                  {confirmModal.counts.comments_on_posts > 0 && (
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{confirmModal.counts.comments_on_posts}</Text>
                      <Text style={styles.countLabel}>Comments</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Items:</Text>
                  <Text style={[
                    styles.totalValue,
                    { color: confirmModal.action === "delete" ? "#ef4444" : "#4c6fff" }
                  ]}>
                    {confirmModal.counts.total}
                  </Text>
                </View>
                
                {confirmModal.action === "delete" && (
                  <View style={styles.warningBox}>
                    <Ionicons name="warning" size={20} color="#ef4444" />
                    <Text style={styles.warningText}>This action cannot be undone!</Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
            
            <View style={styles.confirmActions}>
              <Pressable style={styles.cancelBtn} onPress={closeConfirmModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[
                  styles.confirmBtn,
                  { backgroundColor: 
                    confirmModal.action === "delete" ? "#ef4444" : 
                    confirmModal.action === "hide" ? "#f59e0b" : "#10b981"
                  }
                ]}
                onPress={executeUserAction}
                disabled={confirmModal.loading}
              >
                <Text style={styles.confirmBtnText}>
                  {confirmModal.action === "delete" ? "Delete" : 
                   confirmModal.action === "hide" ? "Hide" : "Restore"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f6fb",
    padding: 20,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerBack: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  noAccessTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
  },
  noAccessText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#4c6fff",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#fff",
  },
  tabBadge: {
    color: "#ef4444",
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  emptyState: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  reportCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reportUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reportAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reportAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  reportAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4c6fff",
  },
  reportUserName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  reportUserEmail: {
    fontSize: 12,
    color: "#6b7280",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusHidden: {
    backgroundColor: "#fef2f2",
  },
  statusActive: {
    backgroundColor: "#f0fdf4",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  reportInfo: {
    flexDirection: "row",
    marginBottom: 6,
  },
  reportLabel: {
    fontSize: 13,
    color: "#6b7280",
    width: 100,
  },
  reportValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    flex: 1,
  },
  reportReason: {
    fontSize: 13,
    color: "#111827",
    flex: 1,
    fontStyle: "italic",
  },
  reportActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnRestore: {
    backgroundColor: "#f0fdf4",
  },
  actionBtnHide: {
    backgroundColor: "#fffbeb",
  },
  actionBtnDelete: {
    backgroundColor: "#fef2f2",
  },
  actionBtnDismiss: {
    backgroundColor: "#f3f4f6",
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInputField: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
  },
  filterBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#fff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    backgroundColor: "#4c6fff",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4c6fff",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  userEmail: {
    fontSize: 12,
    color: "#6b7280",
  },
  userReports: {
    fontSize: 11,
    color: "#ef4444",
    fontWeight: "500",
  },
  userActions: {
    flexDirection: "row",
    gap: 8,
  },
  userActionBtn: {
    padding: 8,
  },
  // Confirmation Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    overflow: "hidden",
  },
  confirmHeader: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
  },
  confirmUserName: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 4,
  },
  confirmLoading: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  confirmLoadingText: {
    fontSize: 14,
    color: "#6b7280",
  },
  countsScroll: {
    maxHeight: 300,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  countsTitle: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 16,
    textAlign: "center",
  },
  countsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  countItem: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    minWidth: 80,
  },
  countValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  countLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  warningText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "500",
    flex: 1,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  // Promoters Tab Styles
  sectionHeader: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  loadingState: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  promoterStats: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  promoterStatItem: {
    flex: 1,
    alignItems: "center",
  },
  promoterStatValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  promoterStatLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  promoterCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  promoterHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  promoterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4c6fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  promoterAvatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  promoterInfo: {
    flex: 1,
  },
  promoterName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  promoterEmail: {
    fontSize: 13,
    color: "#6b7280",
  },
  promoterCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  promoterCode: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4c6fff",
  },
  statusInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  promoterMetrics: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  metricLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  payoutButton: {
    flexDirection: "row",
    backgroundColor: "#10b981",
    borderRadius: 10,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  payoutButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  // Payout Modal
  payoutModal: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    width: "85%",
    maxWidth: 360,
    alignItems: "center",
  },
  payoutModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  payoutPromoterName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4c6fff",
    marginBottom: 4,
  },
  payoutPendingLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },
  payoutInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    width: "100%",
  },
  payoutCurrency: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111827",
    marginRight: 8,
  },
  payoutInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "600",
    color: "#111827",
    paddingVertical: 16,
  },
  payoutActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  payoutCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  payoutCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  payoutConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#10b981",
    alignItems: "center",
  },
  payoutConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  // Transaction styles
  transactionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  transactionStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  statusPaid: {
    backgroundColor: "#10b981",
  },
  statusPending: {
    backgroundColor: "#f59e0b",
  },
  transactionInfo: {
    flex: 1,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  transactionPlan: {
    fontSize: 13,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  transactionDetails: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
  },
  transactionDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  transactionLabel: {
    fontSize: 13,
    color: "#6b7280",
  },
  transactionValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
  },
});
