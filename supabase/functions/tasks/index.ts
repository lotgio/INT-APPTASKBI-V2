// Supabase Edge Function per generare feed VTODO (Attività di Outlook)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import ical from "https://esm.sh/ical-generator@4.1.0";

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Estrai resourceId dall'URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const resourceId = pathParts[pathParts.length - 1];

    if (!resourceId || resourceId === "tasks") {
      return new Response(
        JSON.stringify({ error: "Missing resourceId in path" }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Crea client Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Recupera todos per questa risorsa
    const { data: todos, error: todosError } = await supabase
      .from("todos")
      .select("*")
      .eq("resourceid", resourceId)
      .order("duedate", { ascending: true });

    if (todosError) throw todosError;

    // Recupera info membro
    const { data: member } = await supabase
      .from("members")
      .select("name")
      .eq("id", resourceId)
      .single();

    const memberName = member?.name || "Risorsa";

    // Crea calendario iCal (userato per VTODO)
    const calendar = ical({
      name: `Attività ${memberName}`,
      description: `Attività to-do per ${memberName}`,
      timezone: "Europe/Rome",
      ttl: 900,
      prodId: {
        company: "AppTaskBI",
        product: "Tasks",
        language: "IT",
      },
    });

    // Aggiungi VTODO per ogni todo (Attività in Outlook)
    (todos || []).forEach((todo: any) => {
      const dueDate = todo.duedate ? new Date(todo.duedate) : undefined;

      const description = [
        todo.description || "",
        todo.commessa ? `Commessa: ${todo.commessa}` : "",
        todo.client ? `Cliente: ${todo.client}` : "",
        todo.businessunit ? `BU: ${todo.businessunit}` : "",
      ]
        .filter(Boolean)
        .join("\\n");

      calendar.createTask({
        id: todo.id,
        title: todo.title || "Attività",
        description: description,
        due: dueDate,
        completed: todo.completed,
        status: todo.completed ? "COMPLETED" : "IN-PROCESS",
      });
    });

    // Genera .ics
    const icsContent = calendar.toString();

    return new Response(icsContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="tasks-${resourceId}.ics"`,
        "Cache-Control": "no-cache, must-revalidate",
        "X-WR-CALDESC": `Attività per ${memberName}`,
        "X-WR-CALNAME": `Attività ${memberName}`,
        Refresh: "900",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
