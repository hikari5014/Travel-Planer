// Seed the visual demo data — Kyoto 7-day trip with 3 plans, plus a couple of
// past trips so the dashboard isn't empty on first run. This re-creates the
// `mockTrips` + Day-3 populated `mockDays` + `mockPlans` + `mockPlaces` shape
// so existing /trips/[tripId]* routes keep working after the mock fallbacks
// are removed in Phase 1a.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KYOTO_PLAN_BREAKDOWNS = [
  {
    id: "p1",
    name: "預設方案",
    pace: "標準",
    description: "經典景點 + 在地餐廳 + 中等住宿，平衡選擇。",
    food: 18400, lodging: 38000, transport: 8400, ticket: 9800, misc: 3800,
  },
  {
    id: "p2",
    name: "省錢方案",
    pace: "輕鬆",
    description: "民宿 + 步行/公車 + 自炊輕食，預算優先。",
    food: 11000, lodging: 24000, transport: 5500, ticket: 8500, misc: 3000,
  },
  {
    id: "p3",
    name: "親子方案",
    pace: "緊湊",
    description: "家庭房 + 計程車接駁 + 親子友善景點，便利優先。",
    food: 22000, lodging: 52000, transport: 9000, ticket: 9500, misc: 4000,
  },
];

const KYOTO_PLACES: Array<{
  googlePlaceId: string;
  name: string;
  category: string;
  address: string;
  iconKey: string;
  rating: number;
  ratingCount: number;
  defaultStayMinutes: number;
  mapX: number; mapY: number;
  reviewSnippet: string;
}> = [
  { googlePlaceId: "seed-hotel-ks-house",        name: "京都 K's House",            category: "住宿",       address: "京都市下京區七條",     iconKey: "lodging",    rating: 4.5, ratingCount: 2103,  defaultStayMinutes: 600, mapX: 470, mapY: 720, reviewSnippet: "近京都車站、乾淨舒適、適合自助行旅人。" },
  { googlePlaceId: "seed-place-kiyomizu",        name: "清水寺",                    category: "寺院",       address: "京都市東山區清水",     iconKey: "temple",     rating: 4.6, ratingCount: 12431, defaultStayMinutes: 120, mapX: 720, mapY: 540, reviewSnippet: "由清水舞台俯瞰京都市景，春櫻秋楓皆為極致。" },
  { googlePlaceId: "seed-place-ninenzaka",       name: "二年坂・產寧坂",            category: "歷史街道",   address: "京都市東山區",         iconKey: "machiya",    rating: 4.4, ratingCount: 8821,  defaultStayMinutes: 60,  mapX: 690, mapY: 510, reviewSnippet: "京都最有味道的石板坡道，町家咖啡與傳統工藝並列。" },
  { googlePlaceId: "seed-place-machiya",         name: "町家午餐 · 京豆庵",          category: "餐廳",       address: "京都市東山區八坂",     iconKey: "restaurant", rating: 4.7, ratingCount: 542,   defaultStayMinutes: 90,  mapX: 660, mapY: 480, reviewSnippet: "百年町家改裝，京懷石午間定食，需訂位。" },
  { googlePlaceId: "seed-place-fushimi",         name: "伏見稻荷大社",              category: "神社",       address: "京都市伏見區深草",     iconKey: "shrine",     rating: 4.7, ratingCount: 24988, defaultStayMinutes: 150, mapX: 580, mapY: 760, reviewSnippet: "千本鳥居名列京都必訪第一，建議下午前往避開人潮。" },
  { googlePlaceId: "seed-place-ramen",           name: "本家第一旭 京都本店",       category: "拉麵",       address: "京都市下京區東塩小路", iconKey: "ramen",      rating: 4.3, ratingCount: 6711,  defaultStayMinutes: 45,  mapX: 490, mapY: 690, reviewSnippet: "京都拉麵元祖，醬油豬骨湯頭，深夜至凌晨也營業。" },
];

async function main() {
  console.log("🌱 Seeding…");

  // 1. Settings singleton
  await prisma.settings.upsert({
    where: { id: "default-user" },
    update: {},
    create: {
      id: "default-user",
      baseCurrency: "TWD",
      localCurrency: "JPY",
      fxRates: JSON.stringify({
        TWD: 1,
        JPY: 4.76,
        USD: 0.031,
        EUR: 0.029,
        KRW: 42.3,
        THB: 1.06,
        HKD: 0.24,
        SGD: 0.041,
        CNY: 0.225,
        GBP: 0.024,
        MYR: 0.143,
        VND: 769,
      }),
      fxFetchedAt: new Date(),
      defaultStayMinutesByType: JSON.stringify({
        tourist_attraction: 90,
        museum: 120,
        restaurant: 60,
        cafe: 45,
        lodging: 600,
        parking: 0,
      }),
    },
  });

  // 2. Places (shared cache)
  for (const p of KYOTO_PLACES) {
    await prisma.place.upsert({
      where: { googlePlaceId: p.googlePlaceId },
      update: {},
      create: { ...p, originalName: p.name, defaultStaySource: "HEURISTIC", fetchedAt: new Date() },
    });
  }

  // 3. Kyoto trip + 3 plans + 7 days each + Day 3 populated for the default plan
  const kyotoStart = new Date("2026-05-12");
  const kyotoEnd = new Date("2026-05-18");

  await prisma.trip.deleteMany({ where: { id: "seed-trip-kyoto-7d" } });

  const tripData = await prisma.trip.create({
    data: {
      id: "seed-trip-kyoto-7d",
      title: "京都七日漫遊",
      subtitle: "賞櫻、寺院、町家咖啡",
      destination: "京都 / 大阪",
      startDate: kyotoStart,
      endDate: kyotoEnd,
      coverColor: "from-[#e8a55a] to-[#cc785c]",
      coverIconKey: "temple",
      status: "active",
    },
  });

  const planIds: Record<string, string> = {};
  for (const [idx, p] of KYOTO_PLAN_BREAKDOWNS.entries()) {
    const plan = await prisma.plan.create({
      data: {
        tripId: tripData.id,
        name: p.name,
        displayOrder: idx,
        pace: p.pace,
        description: p.description,
      },
    });
    planIds[p.id] = plan.id;

    // Create 7 Days for each plan
    await prisma.day.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        planId: plan.id,
        dayIndex: i + 1,
        date: new Date(kyotoStart.getTime() + i * 86400000),
      })),
    });

    // Seed 5 Expense entries per plan to mirror the "費用分布" demo
    await prisma.expense.createMany({
      data: [
        { tripId: tripData.id, planId: plan.id, category: "FOOD", amount: p.food, currency: "TWD" },
        { tripId: tripData.id, planId: plan.id, category: "LODGING", amount: p.lodging, currency: "TWD" },
        { tripId: tripData.id, planId: plan.id, category: "TRANSPORT", amount: p.transport, currency: "TWD" },
        { tripId: tripData.id, planId: plan.id, category: "TICKET", amount: p.ticket, currency: "TWD" },
        { tripId: tripData.id, planId: plan.id, category: "MISC", amount: p.misc, currency: "TWD" },
      ],
    });
  }

  await prisma.trip.update({
    where: { id: tripData.id },
    data: { defaultPlanId: planIds.p1 },
  });

  // 4. Populate Day 3 of the default plan (preset) with the demo schedule
  const day3 = await prisma.day.findFirst({
    where: { planId: planIds.p1, dayIndex: 3 },
  });
  if (day3) {
    type ItemSeed = {
      key: string;
      kind: string;
      placeId: string;
      startTime: string; endTime: string; durationMin: number;
      isAllDay?: boolean;
      isTimeLocked?: boolean;
      orderIndex: number;
      hasTicket?: boolean;
      ticketTitle?: string;
      ticketPrice?: number;
      ticketBookingRef?: string;
      note?: string;
    };
    const items: ItemSeed[] = [
      { key: "i1", kind: "LODGING",    placeId: "seed-hotel-ks-house", startTime: "00:00", endTime: "23:59", durationMin: 0,   isAllDay: true,  orderIndex: 0 },
      { key: "i2", kind: "ATTRACTION", placeId: "seed-place-kiyomizu",  startTime: "09:00", endTime: "11:00", durationMin: 120, isTimeLocked: true, orderIndex: 1 },
      { key: "i3", kind: "ATTRACTION", placeId: "seed-place-ninenzaka", startTime: "11:15", endTime: "12:30", durationMin: 75,  orderIndex: 2 },
      { key: "i4", kind: "MEAL",       placeId: "seed-place-machiya",   startTime: "13:00", endTime: "14:30", durationMin: 90,  orderIndex: 3, hasTicket: true, ticketTitle: "町家午餐定食", ticketPrice: 2400, ticketBookingRef: "K-3142", note: "已訂位 · 訂位編號 K-3142" },
      { key: "i5", kind: "ATTRACTION", placeId: "seed-place-fushimi",   startTime: "15:30", endTime: "18:00", durationMin: 150, orderIndex: 4 },
      { key: "i6", kind: "MEAL",       placeId: "seed-place-ramen",     startTime: "19:00", endTime: "19:45", durationMin: 45,  orderIndex: 5 },
    ];
    const itemIds: Record<string, string> = {};
    for (const it of items) {
      const created = await prisma.scheduleItem.create({
        data: {
          dayId: day3.id,
          kind: it.kind,
          placeId: it.placeId,
          startTime: it.startTime,
          endTime: it.endTime,
          durationMin: it.durationMin,
          isAllDay: it.isAllDay ?? false,
          isTimeLocked: it.isTimeLocked ?? false,
          orderIndex: it.orderIndex,
          note: it.note,
        },
      });
      itemIds[it.key] = created.id;
      // 1:1 Ticket+Expense if hasTicket
      if (it.hasTicket && it.ticketTitle && it.ticketPrice) {
        const expense = await prisma.expense.create({
          data: {
            tripId: tripData.id,
            planId: planIds.p1,
            scheduleItemId: created.id,
            category: "TICKET",
            amount: it.ticketPrice,
            currency: "TWD",
          },
        });
        await prisma.ticket.create({
          data: {
            scheduleItemId: created.id,
            category: "ENTRY",
            title: it.ticketTitle,
            price: it.ticketPrice,
            currency: "TWD",
            quantity: 1,
            bookingRef: it.ticketBookingRef,
            expenseId: expense.id,
          },
        });
      }
    }
    // Transports between sequential timed items
    const transports = [
      { from: "i2", to: "i3", mode: "WALKING", distanceMeters: 700,  durationSec: 600 },
      { from: "i3", to: "i4", mode: "WALKING", distanceMeters: 400,  durationSec: 360 },
      { from: "i4", to: "i5", mode: "TRANSIT", distanceMeters: 5800, durationSec: 1500, estimatedCost: 220 },
      { from: "i5", to: "i6", mode: "TRANSIT", distanceMeters: 4500, durationSec: 1380, estimatedCost: 220 },
    ];
    for (const t of transports) {
      const tr = await prisma.transport.create({
        data: {
          fromScheduleItemId: itemIds[t.from],
          toScheduleItemId: itemIds[t.to],
          mode: t.mode,
          distanceMeters: t.distanceMeters,
          durationSec: t.durationSec,
          estimatedCost: t.estimatedCost,
        },
      });
      if (t.estimatedCost) {
        await prisma.expense.create({
          data: {
            tripId: tripData.id,
            planId: planIds.p1,
            transportId: tr.id,
            category: "TRANSPORT",
            amount: t.estimatedCost,
            currency: "JPY",
            fxRateToBase: 4.76,
          },
        });
      }
    }
  }

  // 5. A couple of past trips for the dashboard
  const past = [
    {
      id: "seed-trip-tokyo-2025",
      title: "東京跨年",
      subtitle: "已完成 · 2025/12",
      destination: "東京",
      startDate: new Date("2025-12-28"),
      endDate: new Date("2026-01-02"),
      coverColor: "from-[#252320] to-[#181715]",
      coverIconKey: "landmark",
      status: "past",
      total: 64500,
    },
    {
      id: "seed-trip-yilan-2025",
      title: "宜蘭親子兩日",
      subtitle: "已完成 · 2025/10",
      destination: "宜蘭",
      startDate: new Date("2025-10-15"),
      endDate: new Date("2025-10-16"),
      coverColor: "from-[#5db872] to-[#5db8a6]",
      coverIconKey: "mountain",
      status: "past",
      total: 12300,
    },
  ];
  for (const p of past) {
    await prisma.trip.deleteMany({ where: { id: p.id } });
    const trip = await prisma.trip.create({
      data: {
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        destination: p.destination,
        startDate: p.startDate,
        endDate: p.endDate,
        coverColor: p.coverColor,
        coverIconKey: p.coverIconKey,
        status: p.status,
      },
    });
    const defaultPlan = await prisma.plan.create({
      data: { tripId: trip.id, name: "預設方案", displayOrder: 0, pace: "標準" },
    });
    await prisma.trip.update({ where: { id: trip.id }, data: { defaultPlanId: defaultPlan.id } });
    await prisma.day.create({
      data: {
        planId: defaultPlan.id,
        dayIndex: 1,
        date: p.startDate,
      },
    });
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        planId: defaultPlan.id,
        category: "MISC",
        amount: p.total,
        currency: "TWD",
      },
    });
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
