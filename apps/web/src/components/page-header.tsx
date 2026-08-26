/** A page title with an optional action slot. */
export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <h1 className="display-lg" style={{ margin: 0 }}>
        {title}
      </h1>
      {children ? <div>{children}</div> : null}
    </div>
  );
}
