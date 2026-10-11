import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "!rounded-sm !border !border-rule !bg-sheet !text-ink !shadow-none !font-sans",
          description: "!text-ink-muted",
          error: "!border-rust !text-rust",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
