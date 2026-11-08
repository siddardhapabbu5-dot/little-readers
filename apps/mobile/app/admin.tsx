import { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminBookLogo } from "../components/AdminBookLogo";
import { AdminTabBar } from "../components/AdminTabBar";
import { AdminQuickActionCard } from "../components/admin/AdminQuickActionCard";
import { AdminRevenueChart } from "../components/admin/AdminRevenueChart";
import { AdminStatsSkeleton } from "../components/admin/AdminSkeleton";
import { AdminStatCard } from "../components/admin/AdminStatCard";
import { dash } from "../components/admin/dashboardTheme";
import { AuthGate } from "../components/AuthGate";
import { ErrorText } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";

const GIRL = require("../assets/admin-welcome-girl.jpg");
const SCREEN_W = Dimensions.get("window").width;

type AuthUser = { id: string; name: string; email: string; role: string };

type SchoolRow = {
  id: string;
  name: string;
  createdAt?: string;
  teacherCount: number;
  classroomCount: number;
  studentCount: number;
};

type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  purpose?: string | null;
  provider?: string | null;
  createdAt: string;
  user?: { name?: string; email?: string };
};

type SubRow = {
  id: string;
  plan: string;
  status: string;
  createdAt?: string;
  expiresAt?: string | null;
  user?: { name?: string; email?: string };
};

type ParentRow = {
  id: string;
  name: string;
  email: string;
  childCount: number;
};

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  at: string;
  status: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  soft: string;
};

function formatMoney(amountMinor: number, currency: string) {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: major % 1 === 0 ? 0 : 2,
    }).format(major);
  } catch {
    return `₹${major.toFixed(0)}`;
  }
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function sumSucceeded(rows: PaymentRow[], from: Date, to = new Date()) {
  return rows
    .filter((p) => {
      if (p.status !== "SUCCEEDED" || !p.createdAt) return false;
      const t = new Date(p.createdAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .reduce((n, p) => n + (p.amountCents ?? 0), 0);
}

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [learning, setLearning] = useState({
    grades: 0,
    pending: 0,
    publishedWords: 0,
    lessons: 0,
  });
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    const u = await getUser<AuthUser>();
    setUser(u);
    const [
      schoolRows,
      paymentRows,
      subRows,
      parentRows,
      grades,
      pending,
      words,
      lessons,
    ] = await Promise.all([
      apiRequest<SchoolRow[]>("/admin/schools"),
      apiRequest<PaymentRow[]>("/payments/admin?take=100"),
      apiRequest<SubRow[]>("/subscriptions/admin"),
      apiRequest<ParentRow[]>("/children/admin/parents").catch(() => [] as ParentRow[]),
      // Same grade records as the Grades (Structure) page; active only, like Published words.
      apiRequest<Array<{ id: string; isActive: boolean }>>("/admin/content/grades")
        .then((rows) => [...new Set(rows.filter((g) => g.isActive).map((g) => g.id))])
        .catch(() => [] as string[]),
      apiRequest<Array<{ id: string }>>(
        "/admin/dictionary/assignments?status=PENDING&take=200"
      ).catch(() => []),
      apiRequest<{ total: number }>("/admin/vocabulary/words?isActive=true&take=1").catch(
        () => ({ total: 0 })
      ),
      apiRequest<{ total: number }>("/admin/lessons?take=1").catch(() => ({ total: 0 })),
    ]);
    setSchools(schoolRows);
    setPayments(paymentRows);
    setSubs(subRows);
    setParents(parentRows);
    setLearning({
      grades: grades.length,
      pending: pending.length,
      publishedWords: words.total ?? 0,
      lessons: lessons.total ?? 0,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await load();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Admin access required");
        } finally {
          setLoading(false);
        }
      })();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refresh");
    } finally {
      setRefreshing(false);
    }
  }

  const currency =
    payments.find((p) => p.currency)?.currency ||
    payments.find((p) => p.status === "SUCCEEDED")?.currency ||
    "INR";

  const stats = useMemo(() => {
    const totalStudents =
      schools.reduce((n, s) => n + (s.studentCount ?? 0), 0) ||
      parents.reduce((n, p) => n + (p.childCount ?? 0), 0);
    return {
      grades: learning.grades,
      pending: learning.pending,
      publishedWords: learning.publishedWords,
      lessons: learning.lessons,
      totalStudents,
    };
  }, [schools, parents, learning]);

  const alertCount = useMemo(
    () => payments.filter((p) => p.status === "PENDING" || p.status === "FAILED").length,
    [payments]
  );

  const revenue = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const daily = sumSucceeded(payments, dayStart, now);
    const weekly = sumSucceeded(payments, weekStart, now);
    const monthly = sumSucceeded(payments, monthStart, now);
    const yearly = sumSucceeded(payments, yearStart, now);
    const total = payments
      .filter((p) => p.status === "SUCCEEDED")
      .reduce((n, p) => n + (p.amountCents ?? 0), 0);
    const pending = payments
      .filter((p) => p.status === "PENDING")
      .reduce((n, p) => n + (p.amountCents ?? 0), 0);

    const points = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(dayStart);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      points.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
        amountMinor: sumSucceeded(payments, d, new Date(next.getTime() - 1)),
      });
    }

    return {
      daily: formatMoney(daily, currency),
      weekly: formatMoney(weekly, currency),
      monthly: formatMoney(monthly, currency),
      yearly: formatMoney(yearly, currency),
      total: formatMoney(total, currency),
      pending: formatMoney(pending, currency),
      points,
    };
  }, [payments, currency]);

  const activity = useMemo(() => {
    const items: ActivityItem[] = [];

    for (const p of payments) {
      if (!p.createdAt) continue;
      const ok = p.status === "SUCCEEDED";
      const failed = p.status === "FAILED";
      items.push({
        id: `pay-${p.id}`,
        title: ok
          ? "Successful payment"
          : failed
            ? "Failed payment"
            : `Payment ${p.status.toLowerCase()}`,
        description: `${p.provider === "razorpay" ? "Razorpay" : p.provider || "Payment"} · ${formatMoney(p.amountCents, p.currency)}`,
        at: p.createdAt,
        status: p.status,
        icon: ok ? "checkmark-circle" : failed ? "close-circle" : "time",
        tint: ok ? dash.green : failed ? dash.red : dash.orange,
        soft: ok ? dash.greenSoft : failed ? "#FEE2E2" : dash.orangeSoft,
      });
    }

    for (const s of schools) {
      if (!s.createdAt) continue;
      items.push({
        id: `school-${s.id}`,
        title: "New school registration",
        description: s.name,
        at: s.createdAt,
        status: "NEW",
        icon: "business",
        tint: dash.blue,
        soft: dash.blueSoft,
      });
      if (s.teacherCount > 0) {
        items.push({
          id: `teacher-${s.id}`,
          title: "Teacher registration",
          description: `${s.teacherCount} teacher${s.teacherCount === 1 ? "" : "s"} · ${s.name}`,
          at: s.createdAt,
          status: "ACTIVE",
          icon: "person",
          tint: dash.purple,
          soft: dash.purpleSoft,
        });
      }
      if (s.studentCount > 0) {
        items.push({
          id: `student-${s.id}`,
          title: "New student registration",
          description: `${s.studentCount} student${s.studentCount === 1 ? "" : "s"} · ${s.name}`,
          at: s.createdAt,
          status: "ENROLLED",
          icon: "people",
          tint: dash.orange,
          soft: dash.orangeSoft,
        });
      }
    }

    for (const s of subs) {
      if (!s.createdAt) continue;
      items.push({
        id: `sub-${s.id}`,
        title: "Subscription renewal",
        description: `${s.user?.email ?? s.user?.name ?? "Account"} · ${s.plan} · ${s.status}`,
        at: s.createdAt,
        status: s.status,
        icon: "diamond",
        tint: dash.purple,
        soft: dash.purpleSoft,
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items;
  }, [payments, schools, subs]);

  const quickActions = [
    {
      title: "Review vocabulary",
      subtitle: learning.pending
        ? `${learning.pending} pending review`
        : "Approve and publish dictionary words",
      href: "/admin-words",
      icon: "checkmark-done" as const,
      tint: dash.purple,
      soft: dash.purpleSoft,
    },
    {
      title: "Manage categories",
      subtitle: "Grade → level → group → category",
      href: "/admin-structure",
      icon: "layers" as const,
      tint: dash.blue,
      soft: dash.blueSoft,
    },
    {
      title: "Create lesson",
      subtitle: "Draft Listen/Spell from approved words",
      href: "/admin-lessons",
      icon: "school" as const,
      tint: dash.green,
      soft: dash.greenSoft,
    },
    {
      title: "Programme calendar",
      subtitle: "Six-month vocabulary schedule",
      href: "/admin-programme",
      icon: "calendar" as const,
      tint: dash.orange,
      soft: dash.orangeSoft,
    },
    {
      title: "Dictionary upload",
      subtitle: "Upload kids starter or CSV/XLSX",
      href: "/admin-dictionary",
      icon: "library" as const,
      tint: dash.purple,
      soft: dash.purpleSoft,
    },
    {
      title: "Schools & students",
      subtitle: "Enrollment and classrooms",
      href: "/admin-schools",
      icon: "business" as const,
      tint: dash.blue,
      soft: dash.blueSoft,
    },
    {
      title: "Manage accounts",
      subtitle: "Parents, teachers & access status",
      href: "/admin-users",
      icon: "people" as const,
      tint: dash.purple,
      soft: dash.purpleSoft,
    },
  ];

  const visibleActions = showAllActions ? quickActions : quickActions.slice(0, 4);
  const visibleActivity = showAllActivity ? activity.slice(0, 20) : activity.slice(0, 5);
  const initials = (user?.name ?? "A")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={dash.headerMid}
            />
          }
        >
          {/* ===== HEADER ===== */}
          <LinearGradient
            colors={[dash.headerStart, dash.headerMid, "#8B7CFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 4 }]}
          >
            <View style={styles.blobOne} />
            <View style={styles.blobTwo} />

            <View style={styles.headerRow}>
              <View style={styles.brandRow}>
                <AdminBookLogo size={44} />
                <View>
                  <Text style={styles.brandName}>LEARN WISE</Text>
                  <Text style={styles.tagline}>Learn • Grow • Shine</Text>
                </View>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="Notifications"
                  onPress={() => router.push("/admin-payments" as never)}
                  style={styles.bellBtn}
                >
                  <Ionicons name="notifications-outline" size={22} color="#fff" />
                  {alertCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {alertCount > 9 ? "9+" : String(alertCount)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.badgeDot} />
                  )}
                </Pressable>

                <Pressable
                  accessibilityLabel="Admin profile menu"
                  onPress={() => setMenuOpen((v) => !v)}
                  style={styles.avatarBtn}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </Pressable>
              </View>
            </View>

            {menuOpen ? (
              <View style={styles.menu}>
                <Text style={styles.menuName}>{user?.name ?? "Admin"}</Text>
                <Text style={styles.menuEmail}>{user?.email ?? ""}</Text>
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/admin-settings" as never);
                  }}
                  style={styles.menuItem}
                >
                  <Text style={styles.menuItemText}>Settings</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/subscription" as never);
                  }}
                  style={styles.menuItem}
                >
                  <Text style={styles.menuItemText}>Subscriptions</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Wave into page */}
            <View style={styles.waveWrap} pointerEvents="none">
              <View style={styles.wave} />
            </View>
          </LinearGradient>

          <View style={styles.page}>
            {/* ===== WELCOME HERO ===== */}
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeLeft}>
                <View style={styles.welcomeTitleRow}>
                  <View style={styles.shield}>
                    <Ionicons name="shield-checkmark" size={16} color="#fff" />
                  </View>
                  <Text style={styles.welcomeTitle}>Admin Dashboard</Text>
                </View>
                <Text style={styles.welcomeSub}>
                  Manage schools, subscriptions and learning
                </Text>
                <View style={styles.welcomePill}>
                  <LinearGradient
                    colors={[dash.headerStart, dash.headerEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.welcomePillGrad}
                  >
                    <Text style={styles.welcomePillText}>Welcome Back! 👋</Text>
                  </LinearGradient>
                </View>
              </View>
              <Image source={GIRL} style={styles.girl} resizeMode="contain" />
            </View>

            {error ? <ErrorText>{error}</ErrorText> : null}

            {/* ===== STATS ===== */}
            {loading ? (
              <AdminStatsSkeleton />
            ) : (
              <View style={styles.statsGrid}>
                <AdminStatCard
                  value={String(stats.grades)}
                  label="Grades"
                  icon="layers"
                  tint={dash.blue}
                  soft={dash.blueSoft}
                  accent="rgba(59,130,246,0.12)"
                  onPress={() => router.push("/admin-structure" as never)}
                />
                <AdminStatCard
                  value={String(stats.pending)}
                  label="Pending review"
                  icon="hourglass"
                  tint={dash.orange}
                  soft={dash.orangeSoft}
                  accent="rgba(245,158,11,0.14)"
                  onPress={() => router.push("/admin-dictionary" as never)}
                />
                <AdminStatCard
                  value={String(stats.publishedWords)}
                  label="Published words"
                  icon="book"
                  tint={dash.green}
                  soft={dash.greenSoft}
                  accent="rgba(16,185,129,0.12)"
                  onPress={() => router.push("/admin-words" as never)}
                />
                <AdminStatCard
                  value={String(stats.lessons)}
                  label="Lessons"
                  icon="school"
                  tint={dash.purple}
                  soft={dash.purpleSoft}
                  accent="rgba(109,40,217,0.12)"
                  onPress={() => router.push("/admin-lessons" as never)}
                />
              </View>
            )}

            {/* ===== QUICK ACTIONS ===== */}
            <View style={styles.sectionHead}>
              <View style={styles.sectionLeft}>
                <Ionicons name="flash" size={16} color={dash.purple} />
                <Text style={styles.sectionTitle}>Quick Actions</Text>
              </View>
              <Pressable onPress={() => setShowAllActions((v) => !v)} hitSlop={8}>
                <Text style={styles.viewAll}>
                  {showAllActions ? "Show less" : "View All →"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.actionsStack}>
              {visibleActions.map((a) => (
                <AdminQuickActionCard
                  key={a.title}
                  title={a.title}
                  subtitle={a.subtitle}
                  icon={a.icon}
                  tint={a.tint}
                  soft={a.soft}
                  onPress={() => router.push(a.href as never)}
                />
              ))}
            </View>

            {/* ===== RECENT ACTIVITY ===== */}
            <View style={styles.sectionHead}>
              <View style={styles.sectionLeft}>
                <Ionicons name="time" size={16} color={dash.blue} />
                <Text style={styles.sectionTitle}>Recent Activities</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (activity.length > 5) setShowAllActivity((v) => !v);
                  else router.push("/admin-payments" as never);
                }}
                hitSlop={8}
              >
                <Text style={styles.viewAll}>
                  {showAllActivity ? "Show less" : "View All"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.activityCard}>
              {!loading && !visibleActivity.length ? (
                <Text style={styles.empty}>No recent activities yet.</Text>
              ) : null}
              {visibleActivity.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.activityRow,
                    index < visibleActivity.length - 1 && styles.activityDivider,
                  ]}
                >
                  <View style={[styles.activityIcon, { backgroundColor: item.soft }]}>
                    <Ionicons name={item.icon} size={18} color={item.tint} />
                  </View>
                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>{item.title}</Text>
                    <Text style={styles.activityDesc} numberOfLines={1}>
                      {item.description}
                    </Text>
                  </View>
                  <View style={styles.activityMeta}>
                    <Text style={styles.activityWhen}>{formatRelative(item.at)}</Text>
                    <Text style={[styles.activityStatus, { color: item.tint }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ===== REVENUE ANALYTICS ===== */}
            <AdminRevenueChart
              points={revenue.points}
              currency={currency}
              daily={revenue.daily}
              weekly={revenue.weekly}
              monthly={revenue.monthly}
              yearly={revenue.yearly}
              total={revenue.total}
              pending={revenue.pending}
            />
          </View>
        </ScrollView>

        <AdminTabBar />
      </View>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dash.pageBg },
  scroll: { flex: 1 },
  content: { paddingBottom: 20 },

  header: {
    paddingHorizontal: 18,
    paddingBottom: 48,
    overflow: "hidden",
  },
  blobOne: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.12)",
    top: -40,
    right: -30,
  },
  blobTwo: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    bottom: 10,
    left: -20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { color: "#fff", fontSize: 18, fontWeight: "800" },
  tagline: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600", marginTop: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: dash.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  badgeDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dash.red,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
  },
  avatarText: { color: dash.purple, fontWeight: "800", fontSize: 13 },
  menu: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 4,
    zIndex: 5,
  },
  menuName: { fontWeight: "800", color: dash.text },
  menuEmail: { color: dash.textMuted, fontSize: 12, marginBottom: 6 },
  menuItem: { paddingVertical: 8 },
  menuItemText: { color: dash.purple, fontWeight: "700" },
  waveWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    overflow: "hidden",
  },
  wave: {
    position: "absolute",
    width: SCREEN_W * 1.5,
    height: 100,
    borderRadius: SCREEN_W,
    backgroundColor: dash.pageBg,
    left: -(SCREEN_W * 0.25),
    bottom: -64,
  },

  page: { paddingHorizontal: 16, gap: 14, marginTop: -8 },

  welcomeCard: {
    backgroundColor: dash.welcomeCard,
    borderRadius: 24,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 132,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: "hidden",
  },
  welcomeLeft: { flex: 1, gap: 6, paddingRight: 4, zIndex: 1 },
  welcomeTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  shield: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: dash.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeTitle: { fontSize: 18, fontWeight: "800", color: dash.text, flexShrink: 1 },
  welcomeSub: { color: dash.textMuted, fontSize: 12, lineHeight: 17, paddingRight: 4 },
  welcomePill: { alignSelf: "flex-start", marginTop: 4, borderRadius: 999, overflow: "hidden" },
  welcomePillGrad: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  welcomePillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  girl: { width: 118, height: 128, marginRight: -4 },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: dash.text },
  viewAll: { color: dash.purple, fontWeight: "700", fontSize: 13 },
  actionsStack: { gap: 10 },

  activityCard: {
    backgroundColor: dash.card,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  activityDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EDE9FE",
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: { flex: 1, gap: 2 },
  activityTitle: { fontSize: 13, fontWeight: "700", color: dash.text },
  activityDesc: { fontSize: 11, color: dash.textMuted },
  activityMeta: { alignItems: "flex-end", gap: 2 },
  activityWhen: { fontSize: 11, color: dash.textSoft, fontWeight: "600" },
  activityStatus: { fontSize: 10, fontWeight: "800" },
  empty: { textAlign: "center", color: dash.textMuted, paddingVertical: 18 },
});
