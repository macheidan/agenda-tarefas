import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/CalendarView.module.css';

const STATUS_BG = {
  not_started: '#fafafa',
  in_progress: '#eef5fd',
  done: '#d0ffb2',
};

export default function CalendarView({ tasks, onDateClick, onTaskClick }) {
  const events = tasks.map((task) => {
    const bg = STATUS_BG[task.status] || '#e9e9e7';
    const event = {
      id: task.id,
      title: task.title,
      start: task.date,
      backgroundColor: bg,
      borderColor: '#e8e8e8',
      extendedProps: { task },
    };

    // If there's a finishDate, make it a multi-day event
    // FullCalendar end date is exclusive, so add 1 day
    if (task.finishDate && task.finishDate > task.date) {
      const endDate = new Date(task.finishDate + 'T12:00:00');
      endDate.setDate(endDate.getDate() + 1);
      event.end = endDate.toISOString().split('T')[0];
    }

    return event;
  });

  return (
    <div className={styles.container}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="pt-br"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: '',
        }}
        events={events}
        dateClick={(info) => onDateClick(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onTaskClick(info.event.extendedProps.task);
        }}
        height="auto"
        dayMaxEvents={false}
        buttonText={{
          today: 'Hoje',
        }}
      />
    </div>
  );
}
