"use client";

import { useState, useTransition } from "react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { addLodgingAction } from "@/app/(actions)/add-item-actions";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyContext } from "@/lib/currency-context";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { PlaceQuickSearch, type QuickPlace } from "./PlaceQuickSearch";

export function AddLodgingDialog({
  tripId,
  defaultDate,
  onClose,
  hasGoogleKey,
}: {
  tripId: string;
  defaultDate: string;
  onClose: () => void;
  hasGoogleKey?: boolean;
}) {
  const ctx = useCurrencyContext();
  const baseCurrency = ctx?.primary ?? "TWD";
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();

  const [hotel, setHotel] = useState<QuickPlace | null>(null);
  const [checkInDate, setCheckInDate] = useState(defaultDate);
  const [checkOutDate, setCheckOutDate] = useState(addDays(defaultDate, 1));
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [guestCount, setGuestCount] = useState(2);
  const [totalCost, setTotalCost] = useState("");
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(baseCurrency);
  const [bookingPlatform, setBookingPlatform] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [breakfastIncluded, setBreakfastIncluded] = useState(false);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [parkingFeePerNight, setParkingFeePerNight] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [notes, setNotes] = useState("");

  const nights = nightsBetween(checkInDate, checkOutDate);
  const totalNum = totalCost ? Number(totalCost) : 0;
  const perNight = nights > 0 ? Math.round(totalNum / nights) : 0;
  const perPersonPerNight = nights > 0 && guestCount > 0 ? Math.round(totalNum / nights / guestCount) : 0;

  function submit() {
    if (!hotel) return;
    startSubmit(async () => {
      const r = await addLodgingAction({
        tripId,
        hotel: hotel.googlePlace
          ? { googlePlace: hotel.googlePlace, name: hotel.name }
          : { name: hotel.name, address: hotel.address, lat: hotel.lat, lng: hotel.lng },
        checkInDate,
        checkOutDate,
        checkInTime,
        checkOutTime,
        guestCount,
        totalCost: totalNum > 0 ? totalNum : null,
        ticketCurrency,
        bookingPlatform: bookingPlatform.trim() || null,
        bookingRef: bookingRef.trim() || null,
        breakfastIncluded,
        parkingAvailable,
        parkingFeePerNight: parkingFeePerNight ? Number(parkingFeePerNight) : null,
        wifiPassword: wifiPassword.trim() || null,
        cancellationPolicy: cancellationPolicy.trim() || null,
        notes: notes.trim() || null,
      });
      if (r.ok) {
        addToast({ kind: "success", message: `已新增 ${nights} 晚住宿` });
        onClose();
      } else {
        addToast({ kind: "error", message: r.error });
      }
    });
  }

  const codes = Object.keys(currencyMeta) as CurrencyCode[];

  return (
    <AddItemDialogShell
      title="🏨 新增住宿"
      submitLabel={`新增 ${nights} 晚住宿`}
      submitting={submitting}
      canSubmit={!!hotel && nights > 0}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="飯店 *">
        <PlaceQuickSearch
          value={hotel}
          onChange={setHotel}
          placeholder="飯店名稱 / 地址"
          hasGoogleKey={hasGoogleKey}
          fallbackCategory="住宿"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="入住 *">
          <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="退房 *" hint={nights > 0 ? `共 ${nights} 晚` : "退房日期需晚於入住"}>
          <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="入住時間">
          <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="退房時間">
          <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="入住人數">
          <input type="number" min="1" value={guestCount} onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>

      <div className="rounded-md border border-hairline-soft bg-surface-soft p-3">
        <div className="flex items-baseline gap-2">
          <Field label="總房價">
            <div className="flex gap-1.5">
              <input type="number" min="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} placeholder="28000"
                     className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
              <select value={ticketCurrency} onChange={(e) => setTicketCurrency(e.target.value as CurrencyCode)}
                      className="h-9 w-20 rounded-md border border-hairline bg-canvas px-1 font-mono text-[11px] focus:border-ink focus:outline-none">
                {codes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </Field>
        </div>
        {totalNum > 0 && nights > 0 && (
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-[24px] leading-none text-ink">
              {ticketCurrency} {totalNum.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-soft">
              每晚 {ticketCurrency} {perNight.toLocaleString()} · 每人每晚 {ticketCurrency} {perPersonPerNight.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" checked={breakfastIncluded} onChange={(e) => setBreakfastIncluded(e.target.checked)} />
          含早餐
        </label>
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" checked={parkingAvailable} onChange={(e) => setParkingAvailable(e.target.checked)} />
          有停車位
        </label>
        {parkingAvailable && (
          <Field label="停車費 / 晚（0 = 含房價）">
            <input type="number" min="0" value={parkingFeePerNight} onChange={(e) => setParkingFeePerNight(e.target.value)}
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="訂房平台">
          <input value={bookingPlatform} onChange={(e) => setBookingPlatform(e.target.value)} placeholder="Booking / Agoda / 直接"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="訂房代號">
          <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} placeholder="BK1234567"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="Wi-Fi 密碼" span={2}>
          <input value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="退訂政策" span={2}>
          <input value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} placeholder="3/25 前免費取消"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="備註" span={2}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
    </AddItemDialogShell>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn + "T00:00:00Z").getTime();
  const b = new Date(checkOut + "T00:00:00Z").getTime();
  if (b <= a) return 0;
  return Math.round((b - a) / 86400000);
}
