import { AppShell } from "@/components/app-shell";
import { datasetTypes, sampleImports } from "@/lib/seed-data";
import { FileSpreadsheet, Upload } from "lucide-react";

export default function DatasetsPage() {
  return (
    <AppShell activePath="/datasets">
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-palm">Dataset Upload</p>
              <h1 className="mt-2 text-2xl font-semibold">Import Malaysian business data</h1>
            </div>
            <Upload className="h-6 w-6 text-palm" />
          </div>
          <div className="mt-5 rounded-lg border border-dashed border-palm/50 bg-skyglass p-6 text-center">
            <FileSpreadsheet className="mx-auto h-9 w-9 text-palm" />
            <p className="mt-3 text-sm font-semibold">CSV and Excel parser placeholder</p>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              Goal 2 will wire file upload, preview, mapping, JSONB raw row storage, validation errors, and normalized records.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <h2 className="text-base font-semibold">Supported dataset types</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {datasetTypes.map((type) => (
              <div key={type} className="rounded-md border border-line bg-field px-3 py-2 text-sm font-medium">
                {type}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel lg:col-span-2">
          <h2 className="text-base font-semibold">Recent import history</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-ink/55">
                <tr>
                  <th className="border-b border-line py-3">Dataset</th>
                  <th className="border-b border-line py-3">Type</th>
                  <th className="border-b border-line py-3">Rows</th>
                  <th className="border-b border-line py-3">Tenant evidence</th>
                  <th className="border-b border-line py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sampleImports.map((item) => (
                  <tr key={item.name}>
                    <td className="border-b border-line py-3 font-medium">{item.name}</td>
                    <td className="border-b border-line py-3">{item.type}</td>
                    <td className="border-b border-line py-3">{item.rows.toLocaleString("en-MY")}</td>
                    <td className="border-b border-line py-3">{item.tenant}</td>
                    <td className="border-b border-line py-3 text-palm">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

