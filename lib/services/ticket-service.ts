import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Ticket = user description, Expense = accounting record. Ticket -> Expense
// is a strict 1:1 invariant maintained by this service.

export const TICKET_CATEGORIES = ["ENTRY", "TRANSPORT", "EVENT"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const ticketCreateSchema = z.object({
  scheduleItemId: z.string().min(1),
  category: z.enum(TICKET_CATEGORIES).default("ENTRY"),
  title: z.string().trim().min(1).max(120),
  price: z.number().positive(),
  currency: z.string().length(3).default("TWD"),
  quantity: z.number().int().positive().default(1),
  bookingRef: z.string().max(80).optional().nullable(),
  fxRateToBase: z.number().positive().optional().nullable(),
});
export type TicketCreateInput = z.input<typeof ticketCreateSchema>;

export async function addTicket(input: TicketCreateInput) {
  const parsed = ticketCreateSchema.parse(input);

  const item = await prisma.scheduleItem.findUnique({
    where: { id: parsed.scheduleItemId },
    include: { day: { include: { plan: true } } },
  });
  if (!item) throw new Error("找不到 ScheduleItem");

  const totalAmount = parsed.price * parsed.quantity;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        tripId: item.day.plan.tripId,
        planId: item.day.planId,
        scheduleItemId: item.id,
        category: "TICKET",
        amount: totalAmount,
        currency: parsed.currency,
        fxRateToBase: parsed.fxRateToBase ?? null,
      },
    });
    return tx.ticket.create({
      data: {
        scheduleItemId: parsed.scheduleItemId,
        category: parsed.category,
        title: parsed.title,
        price: parsed.price,
        currency: parsed.currency,
        quantity: parsed.quantity,
        bookingRef: parsed.bookingRef ?? null,
        expenseId: expense.id,
      },
    });
  });
}

export async function updateTicket(
  ticketId: string,
  patch: { title?: string; price?: number; quantity?: number; bookingRef?: string | null; currency?: string },
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("找不到 Ticket");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.bookingRef !== undefined ? { bookingRef: patch.bookingRef ?? null } : {}),
        ...(patch.currency ? { currency: patch.currency } : {}),
      },
    });
    // Sync the linked Expense
    await tx.expense.update({
      where: { id: ticket.expenseId },
      data: {
        amount: updated.price * updated.quantity,
        currency: updated.currency,
      },
    });
    return updated;
  });
}

export async function deleteTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  // Expense cascades from ticket via expenseId @unique + onDelete: Cascade.
  // But schema sets onDelete on Ticket → Expense the other way. To be safe,
  // delete the Ticket first then the Expense.
  await prisma.ticket.delete({ where: { id: ticketId } });
  await prisma.expense.deleteMany({ where: { id: ticket.expenseId } });
}
