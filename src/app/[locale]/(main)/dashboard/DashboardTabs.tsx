// src/app/(main)/dashboard/DashboardTabs.tsx
"use client";

import { useState } from "react";
import { Car, Ticket } from "lucide-react";
import { DriverTripCard, type DriverTripItem } from "./DriverTripCard";
import { PassengerBookingCard, type PassengerBookingItem } from "./PassengerBookingCard";
import Link from "next/link";

interface DashboardTabsProps {
  driverTrips: DriverTripItem[];
  passengerBookings: PassengerBookingItem[];
}

type Tab = "driver" | "passenger";

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  ctaHref,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
  ctaHref: string;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-white/20 rounded-2xl bg-white/10 backdrop-blur-md">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 mb-4">
        <Icon className="w-5 h-5 text-white/60" aria-hidden="true" />
      </div>
      <p className="text-white font-semibold mb-1">{title}</p>
      <p className="text-white/60 text-sm mb-6">{description}</p>
      <Link
        href={ctaHref}
        className="inline-flex items-center h-10 px-5 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-600 transition-colors shadow-md"
      >
        {cta}
      </Link>
    </div>
  );
}

export function DashboardTabs({
  driverTrips,
  passengerBookings,
}: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("driver");

  const pendingCount = passengerBookings.filter(
    (b) => b.status === "pending"
  ).length;
  const pendingDriverCount = driverTrips.reduce(
    (acc, t) => acc + t.bookings.filter((b) => b.status === "pending").length,
    0
  );

  return (
    <div>
      {/* Tab navigation */}
      <div
        className="flex gap-1 p-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl mb-6"
        role="tablist"
        aria-label="Tableau de bord"
      >
        {(
          [
            {
              id: "driver" as Tab,
              label: "Mes trajets",
              icon: Car,
              badge: pendingDriverCount,
            },
            {
              id: "passenger" as Tab,
              label: "Mes demandes",
              icon: Ticket,
              badge: pendingCount,
            },
          ] as const
        ).map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={[
              "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer",
              activeTab === id
                ? "bg-white/20 text-white shadow-sm"
                : "text-white/60 hover:text-white/80",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
            {badge > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-800 text-white text-[10px] font-bold flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Driver tab */}
      <div
        id="panel-driver"
        role="tabpanel"
        aria-labelledby="tab-driver"
        hidden={activeTab !== "driver"}
      >
        {driverTrips.length === 0 ? (
          <EmptyState
            icon={Car}
            title="Aucun trajet proposé"
            description="Partagez votre prochaine route avec la communauté."
            cta="Proposer un trajet"
            ctaHref="/trips/create"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {driverTrips.map((trip) => (
              <DriverTripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>

      {/* Passenger tab */}
      <div
        id="panel-passenger"
        role="tabpanel"
        aria-labelledby="tab-passenger"
        hidden={activeTab !== "passenger"}
      >
        {passengerBookings.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Aucune réservation"
            description="Trouvez un trajet disponible et réservez une place."
            cta="Voir les trajets"
            ctaHref="/trips"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {passengerBookings.map((booking) => (
              <PassengerBookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
