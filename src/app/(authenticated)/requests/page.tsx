"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimeOffTab } from "@/components/requests/time-off-tab";
import { SwapTab } from "@/components/requests/swap-tab";
import { OvertimeRequestsTab } from "./overtime-requests-tab";

export default function RequestsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Solicitudes</h1>
        <p className="text-muted-foreground">
          Gestiona solicitudes de días libres e intercambios de turno
        </p>
      </div>

      <Tabs defaultValue="time-off">
        <TabsList>
          <TabsTrigger value="time-off">Días libres</TabsTrigger>
          <TabsTrigger value="swaps">Intercambios</TabsTrigger>
          <TabsTrigger value="horas-extra">Horas extra</TabsTrigger>
        </TabsList>
        <TabsContent value="time-off" className="mt-4">
          <TimeOffTab />
        </TabsContent>
        <TabsContent value="swaps" className="mt-4">
          <SwapTab />
        </TabsContent>
        <TabsContent value="horas-extra" className="mt-4">
          <OvertimeRequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
