// src/pages/About.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function About() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sobre</h1>
        <p className="text-sm text-muted-foreground">
          Projeto de portfólio focado em back-end, automação e cloud.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OpsPulse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Um mini sistema para cadastrar rotinas e acompanhar execuções (runs),
            pensado para demonstrar boas práticas e integração real com cloud e banco.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Azure Functions</Badge>
            <Badge variant="secondary">Python</Badge>
            <Badge variant="secondary">Supabase (Postgres)</Badge>
            <Badge variant="secondary">Vite + React</Badge>
            <Badge variant="secondary">shadcn/ui</Badge>
          </div>

          <p className="text-muted-foreground">
            Próximos passos: RLS, UI mais completa, métricas por rotina, filtros e paginação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
